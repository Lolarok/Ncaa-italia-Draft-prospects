# Security Specification — HoopScope NCAA Firestore Rules

## 1. Data Invariants

1. **Default Deny**: All unmatched paths in Firestore are denied for both read and write (`match /{document=**} { allow read, write: if false; }`).
2. **Verified Auth Gate for Mutations**: Every create, update, and delete requires an authenticated Google user with `request.auth.token.email_verified == true`.
3. **Identity Integrity**: `authorUid` (on `scouting_notes`, `scouting_videos`), `addedByUid` (on `custom_players`), and `uid` (on `users`) must strictly equal `request.auth.uid` on creation and remain immutable on update.
4. **No PII in Public Collections**: Publicly readable collections (`scouting_notes`, `scouting_videos`, `custom_players`) never store email addresses, phone numbers, or private contact fields. `/users/{userId}` is strictly private to `isOwner(userId)` with `list` denied.
5. **Path Variable Hardening & Bounded Strings**: Every document ID on single-doc operations matches `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), and every string and array field has explicit `.size()` upper/lower limits synced verbatim with `firebase-blueprint.json`.
6. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time` on create; `createdAt` is immutable on update and `updatedAt == request.time`.
7. **Secure List Queries**: `allow list` never grants blanket access; public collections verify `resource.data.visibility == 'public'` directly on the document.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Unauthenticated Write**: Create `scouting_notes/note_1` with `auth == null`.
2. **Unverified Email Write**: Create `scouting_notes/note_1` with `email_verified == false`.
3. **Identity Spoofing**: Create `scouting_notes/note_2` where `authorUid: "other-user-uid"` != `request.auth.uid`.
4. **Shadow Field Injection**: Create `scouting_notes/note_3` containing extra ghost key `isAdmin: true`.
5. **Client-Spoofed Timestamp**: Create `scouting_notes/note_4` with past `createdAt` (`!= request.time`).
6. **ID Poisoning**: Create `scouting_notes/../../evil` or 200-char ID failing `isValidId()`.
7. **Oversized String DoW**: Create `scouting_notes/note_5` with 5000-character `content` (`> 2000`).
8. **Tag Array Poisoning**: Create `scouting_notes/note_6` with 12 tags or unlisted tag string `"HACKED"`.
9. **Unauthorized Cross-User Edit**: User B attempts to update or delete User A's `scouting_notes/note_1`.
10. **Immutable Field Tampering**: Author updates `scouting_notes/note_1` trying to change `playerId` or `createdAt`.
11. **Insecure Video Protocol**: Create `scouting_videos/vid_1` with `url: "javascript:alert(1)"` (fails `^https://.*`).
12. **Cross-User Profile Read / List**: User B calls `get` on `/users/userA` or `list` on `/users`.
13. **BigBoard Vote Stuffing / ID Mismatch**: User A tries to create `big_boards/fake_draft2027` where `boardId != request.auth.uid + '_' + boardType`.
14. **BigBoard Unbounded Tier Array Poisoning**: User A tries to save `tier1` with 40 items (`> 25`) or non-string element `[123]`.
15. **BigBoard Immutable Field Tampering**: User A updates `big_boards/{uid}_draft2027` trying to alter `boardType` or `createdAt` or add ghost field `weight: 999`.
16. **Shortlist Unbounded Array / Type Poisoning**: User A updates `/users/{uid}` with a `shortlist` containing 55 items (`> 50`) or non-string/invalid ID element `["../../evil"]`.
17. **Cross-User Shortlist Tampering**: User B attempts to update `/users/userA` shortlist field or inject ghost field `isAdmin: true` into their own profile.
