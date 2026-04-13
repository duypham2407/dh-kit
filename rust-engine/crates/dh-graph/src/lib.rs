//! Graph storage and projection crate.
//! This crate will materialize canonical graph nodes/edges and traversal indexes.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NodeKind {
    File,
    Symbol,
    Chunk,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EdgeKind {
    Imports,
    Calls,
    References,
    Contains,
    Extends,
    Implements,
    ReExports,
    TypeReferences,
    Exports,
    DefinesChunk,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EdgeDetail {
    None,
    ImportStaticNamed,
    ImportStaticDefault,
    ImportStaticNamespace,
    ImportTypeOnly,
    ImportDynamic,
    ImportRequire,
    CallDirect,
    CallMethod,
    CallConstructor,
    CallCallback,
    CallHigherOrder,
    CallEventEmit,
    CallUnknownDynamic,
    RefRead,
    RefWrite,
    RefReadWrite,
    RefTypeOnly,
    RefArgument,
    RefReExport,
    RefDecorator,
    ContainLexical,
    ContainOwnership,
    ExportNamed,
    ExportDefault,
    ExportStar,
    ExtendClass,
    ExtendInterface,
    ImplementInterface,
    ImplementTrait,
    TypeRefAnnotation,
    TypeRefConstraint,
    TypeRefReturn,
    TypeRefHeritage,
}
