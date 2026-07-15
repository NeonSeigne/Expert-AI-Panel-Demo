"""Live SSE bridge — yield token/status chunks while awaiting LLM work.

Orchestrator call sites historically buffered `message_delta` events in a
plain list and flushed them only after `run_resilient_turn` returned.
That made the UI look like messages (and ballots) "appear all at once."

`LiveSseBridge` is list-like (supports `.append`) so existing
`stream_events.append(...)` call sites keep working, but each append is
also pushed onto an asyncio queue that an outer async generator can
drain concurrently with the await.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")


class LiveSseBridge:
    """Appendable sink that fans SSE strings to a live async iterator."""

    def __init__(self) -> None:
        self._q: asyncio.Queue[str | None] = asyncio.Queue()
        self._closed = False

    def append(self, item: str) -> None:
        if self._closed:
            return
        self._q.put_nowait(item)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._q.put_nowait(None)

    def get_nowait(self) -> str | None:
        """Non-blocking get; returns None if empty (not a close sentinel)."""
        try:
            return self._q.get_nowait()
        except asyncio.QueueEmpty:
            return None

    async def get(self) -> str | None:
        return await self._q.get()

    def empty(self) -> bool:
        return self._q.empty()

    def __aiter__(self) -> LiveSseBridge:
        return self

    async def __anext__(self) -> str:
        item = await self._q.get()
        if item is None:
            raise StopAsyncIteration
        return item


async def await_with_live_sse(
    bridge: LiveSseBridge,
    awaitable: Awaitable[T],
    *,
    close_bridge: bool = True,
) -> AsyncIterator[str | tuple[str, T]]:
    """Yield SSE strings from `bridge` while `awaitable` runs.

    After the awaitable finishes (and the bridge is closed), yields a
    final ``("result", value)`` tuple so call sites can recover the
    return value without a second await.
    """
    async def _runner() -> T:
        try:
            return await awaitable
        finally:
            if close_bridge:
                bridge.close()

    task = asyncio.create_task(_runner())
    async for chunk in bridge:
        yield chunk
    yield ("result", await task)


async def run_resilient_turn_live(
    *,
    run_turn: Callable[..., Awaitable[T]] | None = None,
    **kwargs,
) -> AsyncIterator[str | tuple[str, T]]:
    """Wrap a resilient-turn coroutine with a live SSE bridge.

    Passes ``stream_events=bridge`` into `run_turn` and yields encoded
    SSE chunks as they are appended. Final item is ``("result", turn)``.
    """
    from app.services.resilience import run_resilient_turn as _default_run

    bridge = LiveSseBridge()
    kwargs = dict(kwargs)
    kwargs["stream_events"] = bridge
    if not kwargs.get("stream_message_id"):
        import uuid
        kwargs["stream_message_id"] = str(uuid.uuid4())
    runner = run_turn or _default_run
    async for item in await_with_live_sse(bridge, runner(**kwargs)):
        yield item


async def iter_resilient_turn_sse(**kwargs) -> AsyncIterator[str | tuple]:
    """Yield live SSE chunks then a final ``("turn", result, message_id)``.

    Convenience wrapper used by sequential orchestrator/RR call sites.
    """
    from app.services.resilience import run_resilient_turn

    import uuid
    bridge = LiveSseBridge()
    mid = kwargs.pop("stream_message_id", None) or str(uuid.uuid4())
    kwargs = dict(kwargs)
    kwargs["stream_events"] = bridge
    kwargs["stream_message_id"] = mid

    async def _run():
        try:
            return await run_resilient_turn(**kwargs)
        finally:
            bridge.close()

    task = asyncio.create_task(_run())
    async for chunk in bridge:
        yield chunk
    turn = await task
    yield ("turn", turn, mid)
