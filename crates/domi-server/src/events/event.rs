use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Target {
    pub id: Option<String>,
    pub selector: Option<String>,
    pub rect: Rect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Source {
    #[serde(rename = "domi.js")]
    DomiJs,
    #[serde(rename = "domi-audit.js")]
    DomiAuditJs,
    #[serde(rename = "browser-ext")]
    BrowserExt,
    #[serde(rename = "unknown")]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    Click,
    Input,
    Submit,
    RailAdd,
    RailResolve,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EventData {
    // Order matters: serde untagged tries variants in source order. Click
    // and RailAdd are both optional-everything (their required fields
    // all have defaults or Option types). Listed before Click so a
    // `{body, targetId}` payload — the rail-add wire shape from
    // domi-audit.js — binds to RailAdd rather than accidentally binding
    // to Click with `body` ignored as an unknown field.
    RailAdd { body: String, #[serde(rename = "targetId")] target_id: Option<String> },
    Click { value: Option<String> },
    Input { name: String, value: String },
    Submit {
        #[serde(rename = "formId")]
        form_id: String,
        fields: serde_json::Map<String, serde_json::Value>,
    },
    RailResolve {
        #[serde(rename = "entryId")]
        entry_id: ulid::Ulid,
    },
    Custom {
        payload: serde_json::Map<String, serde_json::Value>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    pub v: u8,
    pub id: ulid::Ulid,
    pub ts: chrono::DateTime<chrono::Utc>,
    pub src: Source,
    pub doc: String,
    pub kind: Kind,
    pub target: Target,
    pub data: EventData,
}

#[cfg(test)]
mod tests {
    fn sample(kind: super::Kind, data: super::EventData) -> super::Event {
        super::Event {
            v: 2,
            id: ulid::Ulid::from_string("01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ0").unwrap(),
            ts: chrono::DateTime::parse_from_rfc3339("2026-07-05T18:21:00Z")
                .unwrap()
                .with_timezone(&chrono::Utc),
            src: super::Source::DomiJs,
            doc: "onboarding-v2".to_string(),
            kind,
            target: super::Target {
                id: Some("btn-save".into()),
                selector: Some("main > .domi-card:nth-of-type(1)".into()),
                rect: super::Rect { x: 120.0, y: 480.0, w: 200.0, h: 32.0 },
            },
            data,
        }
    }

    #[test]
    fn click_round_trips_byte_identical() {
        let ev = sample(
            super::Kind::Click,
            super::EventData::Click { value: Some("Save".into()) },
        );
        let s = serde_json::to_string(&ev).unwrap();
        let back: super::Event = serde_json::from_str(&s).unwrap();
        assert_eq!(ev.doc, back.doc);
        assert_eq!(ev.kind, back.kind);
        match (&ev.data, &back.data) {
            (super::EventData::Click { value: a }, super::EventData::Click { value: b }) => assert_eq!(a, b),
            _ => panic!("kind mismatch after round-trip"),
        }
    }

    #[test]
    fn all_six_kinds_serialize() {
        for (kind, data) in [
            (super::Kind::Click, super::EventData::Click { value: Some("x".into()) }),
            (super::Kind::Input, super::EventData::Input { name: "k".into(), value: "v".into() }),
            (super::Kind::Submit, super::EventData::Submit { form_id: "f".into(), fields: serde_json::Map::new().into() }),
            (super::Kind::RailAdd, super::EventData::RailAdd { body: "x".into(), target_id: Some("btn-save".into()) }),
            (super::Kind::RailResolve, super::EventData::RailResolve {
                entry_id: ulid::Ulid::from_string("01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ9").unwrap(),
            }),
            (super::Kind::Custom, super::EventData::Custom { payload: serde_json::Map::new().into() }),
        ] {
            let ev = sample(kind, data);
            let s = serde_json::to_string(&ev).expect("serialize");
            let back: super::Event = serde_json::from_str(&s).expect("deserialize");
            assert_eq!(ev.id, back.id);
        }
    }
}
