# Arena Eleggante

Domain language for operating and following Barbershop Eleggante EA FC tournaments, designed to accommodate other organizations in the future.

## Identity and access

**Organization**:
The administrative and brand boundary to which tournaments, Owners, and Organizers belong. Platform Admins operate across Organizations; V1 has only Barbershop Eleggante.
_Avoid_: Customer, tenant

**Platform Admin**:
A global administrator who can operate any Organization and its tournaments while obeying tournament state rules and separation of duties.
_Avoid_: Owner, Organizer

**Responsible player**:
The authenticated user who creates and represents their own registration; in V1, the only person allowed to suggest a result for their participation.
_Avoid_: Roster, linked players

**Separation of duties**:
The restriction that prevents any administrator who is also participating from making administrative decisions about their own participation or match.
_Avoid_: Self-approval

**Username**:
The unique public name shown for a player in tournaments, labeled “nome de usuário” in the pt-BR interface.
_Avoid_: Public nick, player name

**Arena Eleggante ID**:
The public, sequential, immutable user code within Arena Eleggante, formatted as `AE-000123`.
_Avoid_: Email, EA ID, PSN ID

## Competition

**Competitive participation**:
A player's tournament slot, identified by their Arena Eleggante ID and represented by that player in V1.
_Avoid_: Team, national team

**Playing team or national team**:
The club or national team chosen or drawn for a participation to use in matches; it can repeat between participants and does not define competitive identity.
_Avoid_: Competitive entry

**Team and national team catalog**:
The single, static, immutable set of choices for selection or drawing: clubs with official names and crests, and national teams with names and country flags; independent of EA FC edition or platform.
_Avoid_: Free text, EA FC synchronization, edition-specific catalog

**Waiting list**:
Pending registration requests because approved capacity has been reached, ordered by registration time and manually approved by an Organizer.
_Avoid_: Approved participation

**Rejected tournament**:
A new tournament rejected with a justification by an Owner or Platform Admin; an Organizer cannot edit it, and only an Owner or Platform Admin can return it to `Rascunho` or open registrations.
_Avoid_: `Rascunho`, archived tournament

**Suspended tournament**:
An `Em andamento` tournament whose operation an Owner or Platform Admin interrupted, while retaining a public read-only page; only an Owner or Platform Admin may resume it.
_Avoid_: `Encerrado`, archived tournament

**Canceled tournament**:
A started tournament permanently ended by an Owner or Platform Admin with a justification and no champion.
_Avoid_: Suspended tournament, `Encerrado`

**Third place**:
An optional podium position decided through a match between semifinal losers or by best campaign; it is not displayed when disabled.
_Avoid_: Mandatory podium

**Result suggestion**:
The score and evidence submitted by the responsible player for a match; it does not affect the competition until an Organizer decides.
_Avoid_: Official result

**Official result**:
The result recorded and published by an Organizer, updating standings, qualifiers, and bracket.
_Avoid_: Result suggestion

**Single W.O.**:
An administrative 3 × 0 result for one participation, fully counted in standings and statistics.
_Avoid_: Voided match

**Double W.O.**:
Administrative voiding of a match for both participations, without counting a match, points, or goals.
_Avoid_: Draw, single W.O.

**Player substitution**:
The administrative replacement of a participation by another player before its first valid match or single W.O.; the substitute inherits a drawn team or national team, but may choose another when player choice applies. After that point, leaving is a withdrawal.
_Avoid_: Withdrawal

**Withdrawal**:
A player leaving after their first valid match or single W.O., handled as W.O. in subsequent matches at the Organizer's discretion.
_Avoid_: Player substitution

**Registration withdrawal**:
A player voluntarily removing their pending request or approved participation before the first draw freezes the eligible set.
_Avoid_: Withdrawal, player substitution

**Versioned consent**:
Recorded acceptance of a specific version of the Terms of Use and Privacy Notice, with date and time.
_Avoid_: Implicit consent

**Anonymization**:
The irreversible handling of an authenticated request that removes or unlinks personal data, including the username, and deactivates the account; results, Arena Eleggante ID, historic team or national team, and minimum required audit trail remain.
_Avoid_: Deletion of competitive history

**Append-only audit trail**:
The administrative history where events are only added; corrections and anonymizations are new events and never rewrite or delete earlier events.
_Avoid_: History editing

**Closed tournament**:
The immutable final state of a completed tournament; its results, podium, and statistics cannot change in V1.
_Avoid_: Suspended tournament, `Em andamento`

**Auditable draw**:
A recorded random allocation of frozen eligible participations, executed under the relevant phase rules.
_Avoid_: Manual allocation

**Team or national team draw**:
A random, non-repeating assignment of playing teams or national teams to approved participants; it requires enough options for every participant.
_Avoid_: Group draw, knockout draw

**Competitive draw**:
The random allocation of players into groups or knockout pairings, independent of each player's playing team or national team.
_Avoid_: Team or national team draw
