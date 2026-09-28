"""Structured, fail-closed errors for the local scientific backend."""


class ScientificBackendError(Exception):
    """Base error whose message is safe to expose through the local job API."""


class ContractError(ScientificBackendError):
    """A request violates the schema or a stated physical precondition."""


class CapabilityUnavailableError(ScientificBackendError):
    """A requested scientific capability is not installed or not implemented."""


class CollisionDomainError(ScientificBackendError):
    """Finite-radius contact left the declared Newtonian validity domain."""


class JobCancelledError(ScientificBackendError):
    """A cooperative local job cancellation interrupted computation."""


class JobStateError(ScientificBackendError):
    """The requested operation is not valid for the job's state."""


class JobCapacityError(ScientificBackendError):
    """The bounded local job executor has no available outstanding-job slot."""


class WorkBudgetError(ScientificBackendError):
    """A valid request exceeded a deterministic scientific-work budget."""


class DatasetCapacityError(ScientificBackendError):
    """An imported dataset would exceed a declared process-memory quota."""


class DatasetInUseError(ScientificBackendError):
    """A queued or running job currently retains an imported dataset."""


class ArtifactCacheCapacityError(ScientificBackendError):
    """Publishing an artifact would grow the retained cache beyond its quota."""


class ArtifactWriterCapacityError(ScientificBackendError):
    """One artifact writer exceeded its bounded temporary-file allowance."""


class ArtifactCacheOwnershipError(ScientificBackendError):
    """Another writer or cleanup process owns the artifact cache."""
