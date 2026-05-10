import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import type { RunEvent, RunEventPayload, RunEventType } from "../../../shared/src/types/run.js";
import { nowIso } from "../../../shared/src/utils/time.js";

export class SessionEventStream {
  readonly events: RunEvent[] = [];
  private readonly eventsRepo: SessionRuntimeEventsRepo;
  private sequence = 0;

  constructor(private readonly input: { repoRoot: string; sessionId: string }) {
    this.eventsRepo = new SessionRuntimeEventsRepo(input.repoRoot);
  }

  emit<TType extends RunEventType>(type: TType, payload: RunEventPayload = {}): RunEvent<TType> {
    const event: RunEvent<TType> = {
      type,
      sessionId: this.input.sessionId,
      sequence: this.sequence + 1,
      timestamp: nowIso(),
      payload,
    };
    this.sequence = event.sequence;
    this.events.push(event);
    this.eventsRepo.save({
      sessionId: this.input.sessionId,
      eventType: type,
      eventJson: event,
      createdAt: event.timestamp,
    });
    return event;
  }
}
