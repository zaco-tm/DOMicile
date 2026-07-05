mod event;
mod writer;

pub use event::{Event, EventData, Kind, Rect, Source, Target};
pub use writer::{EventWriter, FileShape, Rotation, WriteError};
