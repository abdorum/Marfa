// The PeopleSoft settings the tests use: the first institution's, as Raad's server builds them.
import { USER_AGENT } from '../../raad/server/config';
import { psConfig } from '../../src/adapters/sources/peoplesoft/edge/connector';
import { PsSession } from '../../src/adapters/sources/peoplesoft/edge/session';
import { BMC } from '../../src/institutions/bmc';

export const TEST_PS = psConfig(BMC, { userAgent: USER_AGENT });
export const session = () => new PsSession(TEST_PS);
