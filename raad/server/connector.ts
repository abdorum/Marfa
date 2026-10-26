// The connector port lives with the other ports (src/ports/edge.ts), so a
// connector never imports Raad's server. Re-exported here for the server's own files.
export { EdgeError, type ConnectorEnv, type ConnectorResult, type EdgeConnector, type ServerEvent } from '../../src/ports/edge';
