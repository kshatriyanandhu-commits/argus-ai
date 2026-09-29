import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const COOKIE_NAME = "argus_session";
export type Provider = "ollama" | "gemini";

export async function getOwner() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(COOKIE_NAME)?.value;
  return {
    ownerId: existing && /^[a-f0-9-]{36}$/.test(existing) ? existing : crypto.randomUUID(),
    isNew: !existing || !/^[a-f0-9-]{36}$/.test(existing),
  };
}

export function withOwnerCookie<T>(response: NextResponse<T>, ownerId: string, isNew: boolean) {
  if (isNew) {
    response.cookies.set(COOKIE_NAME, ownerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export function safeError(status: number, detail: string) {
  if (/API_KEY_INVALID|api key not valid|invalid api key|key was reported as leaked/i.test(detail)) {
    return "API key rejected or revoked. Configure a valid key in Google AI Studio.";
  }
  if (status === 400) return "The AI request was rejected. Verify model name and parameters.";
  if (status === 401 || status === 403) return "API key rejected. Check key permissions.";
  if (status === 404) return "Model not found. Verify the configured model identifier.";
  if (status === 429) return "API rate limit reached. Please wait a moment and try again.";
  if (status >= 500) return "Upstream AI service temporarily unavailable.";
  return detail || "The AI request failed.";
}

export function getProvider(): Provider {
  return process.env.AI_PROVIDER?.toLowerCase() === "gemini" ? "gemini" : "ollama";
}

export function getOllamaConfig() {
  const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL?.trim() || "llama3.2";
  return { baseUrl, model };
}

export async function getProviderStatus() {
  const provider = getProvider();
  if (provider === "gemini") {
    const configured = Boolean(
      process.env.GEMINI_API_KEY?.trim() ||
        process.env.GOOGLE_API_KEY?.trim() ||
        process.env.GEMINI_API_KEYS?.trim()
    );
    return {
      provider,
      configured,
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      issue: configured ? "" : "Set GEMINI_API_KEY in your environment variables.",
    };
  }

  const { baseUrl, model } = getOllamaConfig();
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!response.ok) throw new Error();
    const data = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const found = data.models?.some(
      (item) => item.name === model || item.model === model || item.name?.split(":")[0] === model
    );
    return {
      provider,
      configured: Boolean(found),
      model,
      issue: found ? "" : `Model '${model}' not pulled. Run: ollama pull ${model}`,
    };
  } catch {
    return {
      provider,
      configured: false,
      model,
      issue: "Cannot reach Ollama daemon. Start it with `ollama serve`.",
    };
  }
}