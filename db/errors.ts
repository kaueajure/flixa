type ErrorLike = {
  code?: unknown;
  errno?: unknown;
  sqlState?: unknown;
  message?: unknown;
  cause?: unknown;
};

export type DatabaseFailure = {
  code: string;
  message: string;
  technicalCode: string;
  transient: boolean;
};

function errorChain(error: unknown) {
  const chain: ErrorLike[] = [];
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth += 1) {
    chain.push(current as ErrorLike);
    current = (current as ErrorLike).cause;
  }
  return chain;
}

function technicalCode(error: unknown) {
  for (const item of errorChain(error).reverse()) {
    const value = item.code ?? item.errno ?? item.sqlState;
    if (value != null && String(value).trim()) return String(value).trim().toUpperCase();
  }
  return "UNKNOWN";
}

function isLocalDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function runtimeLabel() {
  return isLocalDevelopment() ? "ambiente local" : "ambiente publicado";
}

function hasMessage(error: unknown, fragment: string) {
  const expected = fragment.toLowerCase();
  return errorChain(error).some((item) =>
    typeof item.message === "string" && item.message.toLowerCase().includes(expected),
  );
}

function localErrorSummary(error: unknown) {
  return errorChain(error).map((item, depth) => {
    const rawMessage = typeof item.message === "string" ? item.message.split("\n")[0] : "";
    return {
      depth,
      name: item && typeof item === "object" && "name" in item ? String(item.name) : "Error",
      code: item.code == null ? null : String(item.code),
      message: rawMessage.startsWith("Failed query:")
        ? "Drizzle não conseguiu executar a consulta (SQL e parâmetros ocultados)."
        : rawMessage.slice(0, 300),
    };
  });
}

export function describeDatabaseFailure(error: unknown): DatabaseFailure {
  const technical = technicalCode(error);
  if (["ETIMEDOUT", "PROTOCOL_SEQUENCE_TIMEOUT", "CONNECT_TIMEOUT", "ER_QUERY_TIMEOUT"].includes(technical)) {
    return { code: "DB_CONNECTION_TIMEOUT", technicalCode: technical, transient: true, message: "O banco não respondeu a tempo. Verifique MYSQL_HOST, porta 3306 e a liberação de acesso remoto." };
  }
  if (["ENOTFOUND", "EAI_AGAIN"].includes(technical)) {
    return { code: "DB_HOST_NOT_FOUND", technicalCode: technical, transient: true, message: `O endereço configurado em MYSQL_HOST não pôde ser localizado no ${runtimeLabel()}.` };
  }
  if (["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ENETDOWN"].includes(technical)) {
    return { code: "DB_CONNECTION_REFUSED", technicalCode: technical, transient: true, message: "O servidor MySQL recusou a conexão. Confira host, porta e acesso remoto." };
  }
  if (["ECONNRESET", "ECONNABORTED", "PROTOCOL_CONNECTION_LOST", "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR", "EPIPE"].includes(technical)) {
    return { code: "DB_CONNECTION_LOST", technicalCode: technical, transient: true, message: "A conexão com o MySQL foi interrompida durante a consulta. Tente novamente." };
  }
  if (technical === "ER_USER_LIMIT_REACHED") {
    return {
      code: "DB_HOURLY_USAGE_LIMIT",
      technicalCode: technical,
      transient: true,
      message: "O limite de uso por hora da conta MySQL foi atingido. Aguarde a renovação da cota do provedor.",
    };
  }
  if (["ER_CON_COUNT_ERROR", "ER_TOO_MANY_USER_CONNECTIONS", "ER_GET_CONNECTION_TIMEOUT"].includes(technical)) {
    return { code: "DB_CONNECTION_LIMIT", technicalCode: technical, transient: true, message: "O limite de conexões simultâneas do MySQL foi atingido." };
  }
  if (
    hasMessage(error, "pool is closed")
    || hasMessage(error, "connection is closed")
    || hasMessage(error, "closed state")
  ) {
    return { code: "DB_CONNECTION_LOST", technicalCode: technical, transient: true, message: "A conexão ociosa com o MySQL foi encerrada e será aberta novamente." };
  }
  if (technical === "ER_ACCESS_DENIED_ERROR") {
    return { code: "DB_ACCESS_DENIED", technicalCode: technical, transient: false, message: `O MySQL rejeitou MYSQL_USER ou MYSQL_PASSWORD no ${runtimeLabel()}.` };
  }
  if (technical === "ER_BAD_DB_ERROR") {
    return { code: "DB_DATABASE_NOT_FOUND", technicalCode: technical, transient: false, message: "O banco configurado em MYSQL_DATABASE não existe ou não está acessível." };
  }
  if (["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR", "ER_SP_DOES_NOT_EXIST"].includes(technical)) {
    return { code: "DB_SCHEMA_OUTDATED", technicalCode: technical, transient: false, message: `O banco do ${runtimeLabel()} está desatualizado. Execute npm run db:migrate usando as credenciais desse ambiente.` };
  }
  if (["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(technical)) {
    return { code: "DB_TRANSACTION_CONFLICT", technicalCode: technical, transient: true, message: "A consulta encontrou um bloqueio temporário no MySQL e pode ser repetida." };
  }
  return {
    code: "DB_QUERY_FAILED",
    technicalCode: technical,
    transient: false,
    message: `A consulta ao banco falhou no ${runtimeLabel()}.`,
  };
}

export function safeDatabaseError(error: unknown, action: string) {
  const failure = describeDatabaseFailure(error);
  console.error(`[database] ${failure.code} (${failure.technicalCode}) durante: ${action}`);
  if (isLocalDevelopment()) {
    console.error("[database] cadeia da falha:", localErrorSummary(error));
  }
  const diagnostic = isLocalDevelopment()
    ? `${failure.code}:${failure.technicalCode}`
    : failure.code;
  return new Error(`${failure.message} [${diagnostic}]`);
}
