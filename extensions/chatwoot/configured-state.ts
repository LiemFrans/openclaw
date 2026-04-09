export function hasChatwootConfiguredState(params: { env?: NodeJS.ProcessEnv }): boolean {
  return (
    typeof params.env?.CHATWOOT_BASE_URL === "string" &&
    params.env.CHATWOOT_BASE_URL.trim().length > 0 &&
    typeof params.env?.CHATWOOT_API_KEY === "string" &&
    params.env.CHATWOOT_API_KEY.trim().length > 0
  );
}
