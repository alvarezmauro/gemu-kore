"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin requests: the browser never receives a server secret or token.
export const authClient = createAuthClient({ basePath: "/api/auth" });
