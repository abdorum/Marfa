// The connectors Raad's server hosts, built from the institution this
// deployment serves. One per deployment for now; the sync route serves the first.
import { createPeopleSoftConnector, psConfig } from '../../src/adapters/sources/peoplesoft/edge/connector';
import { INSTITUTION } from '../../src/institutions';
import { USER_AGENT } from './config';
import type { EdgeConnector } from './connector';

export const CONNECTORS: readonly EdgeConnector[] = [createPeopleSoftConnector(psConfig(INSTITUTION, { userAgent: USER_AGENT }))];
