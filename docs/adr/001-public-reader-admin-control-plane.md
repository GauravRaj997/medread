# ADR-001: Public reader with a private admin control plane

**Status:** Accepted  
**Date:** 2026-09-10

## Context

MedRead should be available without public accounts, while still protecting medical uploads and giving the team a way to handle support requests and suspicious documents.

## Decision

The public product has no registration or login. A separate password-protected admin area is reserved for staff and provides:

- a contact-message inbox;
- a queue of blank, non-prescription, and low-confidence uploads;
- an audit trail for review actions.

Uploads remain unlimited for ordinary visitors, but are rate limited by a salted IP hash. Files must pass type, size, and signature checks before storage. OCR then flags likely non-prescriptions or poor-quality scans for review.

## Consequences

- The public experience stays frictionless.
- Admin access requires a secure administrator bootstrap and session implementation.
- Automated checks reduce abuse, but human review remains necessary for ambiguous documents.
