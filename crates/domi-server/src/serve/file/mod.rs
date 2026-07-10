//! Static file serving pipeline.
//!
//! - [`safety`] — path classification, content-type mapping, escape checks
//! - [`static_get`] — body shaping (HTML shim injection) and the
//!   `serve_file` read path
//!
//! Public surface preserved at `crate::serve::file::*`.

pub mod safety;
pub mod static_get;

#[cfg(test)]
mod tests;

pub use static_get::serve_file;

use std::io;

/// Response body returned by `serve_file`.
#[derive(Debug)]
pub struct ServedFile {
    pub body: Vec<u8>,
    pub content_type: ContentType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentType {
    Html,
    Css,
    Js,
    Json,
    Png,
    Jpeg,
    Svg,
    PlainText,
    OctetStream,
}

#[derive(Debug)]
#[non_exhaustive]
pub enum ServeError {
    NotFound,
    NotAFile,
    Io(io::Error),
    EscapedRoot,
}
