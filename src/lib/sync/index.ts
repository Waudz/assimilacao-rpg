import { SyncEngine } from './engine';
import { supabaseRemote, syncConfigured } from './remote';

export { syncConfigured, supabaseRemote };
export const engine = new SyncEngine(supabaseRemote);
export { syncLabel } from './engine';
