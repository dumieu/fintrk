-- Remove MCP / Connect your AI tables. Created at runtime, not by an earlier migration.
DROP TABLE IF EXISTS mcp_access_log;
DROP TABLE IF EXISTS mcp_tokens;
DROP TABLE IF EXISTS mcp_auth_codes;
DROP TABLE IF EXISTS mcp_clients;
