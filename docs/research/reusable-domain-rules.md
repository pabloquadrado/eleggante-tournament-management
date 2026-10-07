# Reusable domain rules

Research date: 2026-10-07. The Owner adopted the responsibility-based vocabulary and shared application-service transaction rule on the same date. This note records their primary-source rationale and an implementation example.

The agreed use-case rules are maintained in [Architecture rules](../agents/architecture.md#application-use-cases). This note investigates which domain concepts should own shared business rules.

## Findings from primary sources

**Reuse does not determine the owner.** Fowler warns that extracting all behavior into services produces an anemic domain model: validations, calculations, and business rules should remain in domain objects when they belong there. Application services coordinate those objects. A rule does not need a service merely because two use cases use it. [Martin Fowler, Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html)

**Domain service is the established term for a domain operation without a natural object owner.** Evans defines a service for a significant domain process or transformation that does not naturally belong to an entity or value object. Its contract and name should express the domain's language. Evans describes modules separately as groups of cohesive domain concepts; a module organizes rules and objects rather than replacing their behavioral responsibilities. [Eric Evans, DDD Reference, Services and Modules, printed pages 14–15](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf#page=21)

**Entities and value objects can provide reusable behavior directly.** Microsoft's guidance places validation and state transitions in entities; value objects can express domain logic through methods that return new values without side effects. It distinguishes stateless domain services for rules that span entities from application services that coordinate repositories, transactions, and external interactions. [Microsoft, Tactical DDD](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-domain-driven-design)

**Specification is a narrower pattern for matching candidates against criteria.** Evans and Fowler separate the criteria from the object being checked. Specifications support selection, validation, and constructing something that satisfies requirements; composite specifications combine criteria. Their paper warns against extending specifications into general objects or workflows. [Eric Evans and Martin Fowler, Specifications](https://www.martinfowler.com/apsupp/spec.pdf)

**Use cases and shared coordination belong to the application layer.** Clean Architecture places application operations in use cases that direct entities, independently of UI, databases, and frameworks. The Service Layer pattern gives multiple interfaces a common application boundary and coordinates transactions and responses. These responsibilities remain application concerns when reused. [Robert C. Martin, The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html), [Randy Stafford, Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html)

**Repository contracts must preserve the inward dependency direction.** Microsoft's DDD guidance places domain repository abstractions in the domain model and persistence implementations in infrastructure. That is a reference architecture choice, not evidence that every query or transaction port belongs in domain. [Microsoft, Infrastructure Persistence Layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)

## Adopted repository vocabulary

The responsibility-based classification was inferred from these sources and adapted to this repository, then accepted by the Owner. Its authoritative definitions are maintained in [Reusable business behavior](../agents/architecture.md#reusable-business-behavior).

`Policy` is a local descriptive name, rather than a universal DDD interface. Existing `otp-policy.ts` and `session-policy.ts` already use that word. Repository-interface placement remains governed by the existing architecture: workflow queries and units of work live in application, concrete persistence lives in infrastructure, and domain dependencies point inward.

## Applied transaction seam

The original profile workflow called the OTP request workflow inside the profile update's transaction. The refactor preserves that seam: `UpdateOnboardingProfileUseCase` and `UpdatePlayerProfileUseCase` own the unit of work and call `ProfileUpdateService`, which calls `OtpRequestService` with the same transaction-bound repositories when a phone change needs verification. The challenge, notification intent, audit record, and profile command replay result therefore commit together.

`RequestSignInCodeUseCase` reuses `OtpRequestService` inside its own unit of work. The shared service always requires transaction-bound repositories. OTP request limits and actor eligibility are domain policies; persistence and outbox coordination remain application concerns. `OtpConsumptionService` similarly participates in the verification and phone-confirmation transactions. Each outer use case owns its authorization and transaction, preserving locking, replay, outbox, and audit guarantees.
