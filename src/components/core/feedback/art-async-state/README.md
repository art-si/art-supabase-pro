# ArtAsyncState

Shared loading, empty, error, and retry feedback for a bounded content region. Pass a safe workflow message or an Error; technical errors are normalized by the shared error boundary. Listen to `retry` to repeat the current request without clearing user inputs.

Use `size="compact"` for error feedback in short embedded regions such as data selectors. It reduces the result icon, padding, and vertical gaps while keeping the same message and retry action. The default size is unchanged. The container still needs a bounded parent and, where content may overflow, an `ElScrollbar`; compact spacing is not a substitute for accessible scrolling.
