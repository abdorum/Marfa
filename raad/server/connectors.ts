// The connectors Raad's server hosts. One per deployment for now; the sync
// route serves the first.
import { peoplesoftConnector } from '../../src/adapters/sources/peoplesoft/edge/connector';
import type { EdgeConnector } from './connector';

export const CONNECTORS: readonly EdgeConnector[] = [peoplesoftConnector];
