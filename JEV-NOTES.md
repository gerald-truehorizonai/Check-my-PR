# Jev cheat sheet (hackathon, 2026-10-15)

Sources: typesafe.ai/blog/jev-1-14, docs.typesafe.ai (full index: docs.typesafe.ai/llms.txt)

## What it is
Jev is a "System One" model from TypeSafe: fast, typed judgements, not text generation.
You send a `state` (text/JSON, and now images) plus a set of typed `questions`.
You get back typed answers with probabilities and confidence. No prose to parse.

- All questions run in parallel and see the same state, but are isolated from each other.
  Adding questions barely changes latency, so ask extra questions up front and ignore the ones you don't need ("speculative fan-out").
- Question IDs are never sent to the model. Write the full question in `instructions`.
- Pricing: $0.042 per million input tokens. Output tokens are free.

## Setup
```bash
export TYPESAFE_API_KEY=...            # console.typesafe.ai/keys
uv add typesafe-sdk                    # Python 3.10+  (extras: pil, http2, zstd)
npm install @typesafe-ai/sdk           # Node 20+, set "type": "module"
# Claude Code skill:
claude plugin marketplace add typesafe-ai/skills && claude plugin install typesafe@typesafe-ai
```
Endpoint: `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer $TYPESAFE_API_KEY`

## Question types
| Type | Use for | criteria | Returns |
|---|---|---|---|
| `choice` | pick one from an unordered set | `{option: description}` | `choice`, `probabilities`, `confidence` |
| `score` | position on an ordered scale | `[level0, level1, ...]` | `score` (can fall between levels), `legend`, `probabilities`, `confidence` |
| `noul` | yes/no | optional yes/no definitions | `noul` = P(yes), 0 to 1 (no separate confidence) |
| `box` (new in 1.14, experimental) | find a thing in an image | none | `box {top,bottom,left,right}` as 0-1 fractions, `confidence` |

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

with TypeSafeClient(model="jev-latest") as client:
    r = client.system_one(
        state={"ticket": "API returns 500s since this morning, we're losing sales!"},
        questions={
            "dept": Choice(instructions="Which team should handle `ticket`?",
                           criteria={"billing": "...", "technical": "...", "sales": "..."}),
            "frustration": Score(instructions="How frustrated is the writer of `ticket`?",
                                 criteria=["Calm.", "Frustrated but civil.", "Very angry."]),
            "urgent": Noul(instructions="Does `ticket` describe an urgent outage?"),
        },
    )
r.choices["dept"].choice, r.scores["frustration"].score, r.nouls["urgent"].noul
```

## Models
| ID | Alias | Notes |
|---|---|---|
| `jev-1.14.0` | `jev-preview` | New 1.14. Needed for `box`. Better multilingual support. |
| `jev-1.13.0` | `jev-latest` (until about 2026-10-21, then it moves to 1.14) | SDK default |

Context: 64k tokens per request and 32k per question by default. With the long-context header, both limits rise to 262k (slower, less accurate).
Rate limits are per organisation and shown in the console. A 429 is retried automatically by the SDKs.

## 1.14 experimental ("Danger Zone") features, enabled by headers
- Images: `TypeSafe-Danger-Zone-Images: true`. Needed on every request that has an image or a box question.
  - Put each image once in the top-level `assets` map, keyed by a unique string (use a UUID). Write that string anywhere in `state`, `instructions` or `criteria`, and the API swaps the image in for it.
  - Each time the key appears, the model gets another copy of the image (each copy costs tokens). If several questions need the same image, put it in `state` once.
  - Formats: PNG or JPEG only, 256 to 1568 px per side, 16 MiB per file, 32 MiB per request. Images outside the limits are rejected, never resized. EXIF orientation is ignored, so rotate the pixels yourself first.
  - Multipart upload is recommended over base64 (base64 is about 33% bigger). Python helpers: `Image(Path(...))` and `Image.from_pil(...)`.
- Box: `{"type":"box","instructions":"the coffee mug in `photo`"}`, with model `jev-preview`.
  - It always returns a box and has no "not found" answer. Pair it with a Noul ("is there a mug?") to check the thing is there.
  - One box per question. For small targets, crop the image first, then run box on the crop.
  - To check a box, crop to it and ask one Noul per edge ("is the target cut off at the left?").
- Long context: `TypeSafe-Danger-Zone-Long-Context: true`.

## Known weaknesses (from the docs' list for 1.13)
Do these in code, not in Jev: maths, counting, dates and durations, converting hex/binary/RGB, generating text.
- It answers literally. Spell out exact conditions and put boundary cases in the criteria.
- It leans toward the first Choice option. Shuffle the order to test.
- Unrelated state lowers accuracy. Filter state before sending.
- Injected or misleading text in the state can shift answers.
- Avoid double negatives and multi-step reasoning. Split those into simple questions and combine the answers in code.

## Patterns worth stealing
- Confidence-gated routing: confidence below about 0.6 goes to a human, a risky action needs above about 0.85 to run automatically, and anything in between asks the user to confirm.
- Composite scoring: ask several small Score questions and combine them with weights in code.
- Jev plus an LLM: Jev routes or classifies quickly and cheaply, the LLM writes the text or splits a compound request (see the smart-home demo).
- Cookbooks: LLM guardrails, citation checking, re-ranking, hierarchical classification, memory.
