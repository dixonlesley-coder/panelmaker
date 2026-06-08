/**
 * Channel name re-export. The canonical channel constants live in the shared
 * IPC contract (so the renderer/preload share them); this module re-exports them
 * for the main process and is the single import site for handler registration.
 */

export { IPC } from '@shared/ipc-contract';
export type { IpcChannel } from '@shared/ipc-contract';
