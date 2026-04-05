package session

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
	"github.com/duypham93/dh/packages/opencode-core/internal/db"
	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/logging"
	"github.com/duypham93/dh/packages/opencode-core/internal/pubsub"
)

type Session struct {
	ID               string
	ParentSessionID  string
	Title            string
	MessageCount     int64
	PromptTokens     int64
	CompletionTokens int64
	SummaryMessageID string
	Cost             float64
	CreatedAt        int64
	UpdatedAt        int64
}

type Service interface {
	pubsub.Suscriber[Session]
	Create(ctx context.Context, title string) (Session, error)
	CreateTitleSession(ctx context.Context, parentSessionID string) (Session, error)
	CreateTaskSession(ctx context.Context, toolCallID, parentSessionID, title string) (Session, error)
	Get(ctx context.Context, id string) (Session, error)
	List(ctx context.Context) ([]Session, error)
	Save(ctx context.Context, session Session) (Session, error)
	Delete(ctx context.Context, id string) error
}

type service struct {
	*pubsub.Broker[Session]
	q          db.Querier
	stateStore *DhStateStore
}

func (s *service) applySessionStateHook(ctx context.Context, sessionID string) {
	// [dh hook] Session State: inject dh state after session creation
	if state, hookErr := dhhooks.OnSessionCreate(ctx, sessionID); hookErr != nil {
		logging.Warn("dh session state hook error", "session", sessionID, "error", hookErr)
	} else if state != nil {
		injected := SetDhSessionStateFromHook(sessionID, state)
		logging.Debug("dh session state injected", "session", sessionID)
		logging.Debug("dh session state snapshot", "session", sessionID, "lane", injected.Lane, "stage", injected.CurrentStage)

		// Persist to DB via DhStateStore
		if s.stateStore != nil {
			if err := s.stateStore.Save(ctx, injected); err != nil {
				logging.Warn("failed to persist dh session state on create", "session", sessionID, "error", err)
			}
		}
	}
}

func (s *service) Create(ctx context.Context, title string) (Session, error) {
	dbSession, err := s.q.CreateSession(ctx, db.CreateSessionParams{
		ID:    uuid.New().String(),
		Title: title,
	})
	if err != nil {
		return Session{}, err
	}
	session := s.fromDBItem(dbSession)
	s.applySessionStateHook(ctx, session.ID)

	s.Publish(pubsub.CreatedEvent, session)
	return session, nil
}

func (s *service) CreateTaskSession(ctx context.Context, toolCallID, parentSessionID, title string) (Session, error) {
	dbSession, err := s.q.CreateSession(ctx, db.CreateSessionParams{
		ID:              toolCallID,
		ParentSessionID: sql.NullString{String: parentSessionID, Valid: true},
		Title:           title,
	})
	if err != nil {
		return Session{}, err
	}
	session := s.fromDBItem(dbSession)
	s.applySessionStateHook(ctx, session.ID)
	s.Publish(pubsub.CreatedEvent, session)
	return session, nil
}

func (s *service) CreateTitleSession(ctx context.Context, parentSessionID string) (Session, error) {
	dbSession, err := s.q.CreateSession(ctx, db.CreateSessionParams{
		ID:              "title-" + parentSessionID,
		ParentSessionID: sql.NullString{String: parentSessionID, Valid: true},
		Title:           "Generate a title",
	})
	if err != nil {
		return Session{}, err
	}
	session := s.fromDBItem(dbSession)
	s.applySessionStateHook(ctx, session.ID)
	s.Publish(pubsub.CreatedEvent, session)
	return session, nil
}

func (s *service) Delete(ctx context.Context, id string) error {
	session, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	err = s.q.DeleteSession(ctx, session.ID)
	if err != nil {
		return err
	}
	// Delete from both in-memory cache and persistent store
	if s.stateStore != nil {
		_ = s.stateStore.Delete(ctx, session.ID)
	} else {
		DeleteDhSessionState(session.ID)
	}
	s.Publish(pubsub.DeletedEvent, session)
	return nil
}

func (s *service) Get(ctx context.Context, id string) (Session, error) {
	dbSession, err := s.q.GetSessionByID(ctx, id)
	if err != nil {
		return Session{}, err
	}
	return s.fromDBItem(dbSession), nil
}

func (s *service) Save(ctx context.Context, session Session) (Session, error) {
	dbSession, err := s.q.UpdateSession(ctx, db.UpdateSessionParams{
		ID:               session.ID,
		Title:            session.Title,
		PromptTokens:     session.PromptTokens,
		CompletionTokens: session.CompletionTokens,
		SummaryMessageID: sql.NullString{
			String: session.SummaryMessageID,
			Valid:  session.SummaryMessageID != "",
		},
		Cost: session.Cost,
	})
	if err != nil {
		return Session{}, err
	}
	session = s.fromDBItem(dbSession)
	s.Publish(pubsub.UpdatedEvent, session)
	return session, nil
}

func (s *service) List(ctx context.Context) ([]Session, error) {
	dbSessions, err := s.q.ListSessions(ctx)
	if err != nil {
		return nil, err
	}
	sessions := make([]Session, len(dbSessions))
	for i, dbSession := range dbSessions {
		sessions[i] = s.fromDBItem(dbSession)
	}
	return sessions, nil
}

func (s service) fromDBItem(item db.Session) Session {
	return Session{
		ID:               item.ID,
		ParentSessionID:  item.ParentSessionID.String,
		Title:            item.Title,
		MessageCount:     item.MessageCount,
		PromptTokens:     item.PromptTokens,
		CompletionTokens: item.CompletionTokens,
		SummaryMessageID: item.SummaryMessageID.String,
		Cost:             item.Cost,
		CreatedAt:        item.CreatedAt,
		UpdatedAt:        item.UpdatedAt,
	}
}

// NewService creates a session service with in-memory-only state (no persistence).
// Use NewServiceWithDB for persistent DhSessionState support.
func NewService(q db.Querier) Service {
	broker := pubsub.NewBroker[Session]()
	return &service{
		Broker:     broker,
		q:          q,
		stateStore: nil, // in-memory only
	}
}

// NewServiceWithDB creates a session service backed by persistent DhSessionState storage.
// It creates a DhStateStore from the provided *sql.DB and rehydrates any existing
// session states from the database at startup.
func NewServiceWithDB(q db.Querier, conn *sql.DB) Service {
	broker := pubsub.NewBroker[Session]()
	store := NewDhStateStore(conn)

	// Rehydrate persisted session states into in-memory cache
	if conn != nil && store.TableExists(context.Background()) {
		if _, err := store.LoadAll(context.Background()); err != nil {
			logging.Warn("failed to rehydrate dh session states from db", "error", err)
		}
	}

	return &service{
		Broker:     broker,
		q:          q,
		stateStore: store,
	}
}
