/** Only same-site paths are allowed as a post-login destination, so a crafted link can't bounce someone to another site or into /admin. */
export const safeNext = (value: string | null): string =>
  value && /^\/(?!\/)[A-Za-z0-9/_\-?=&%.#]*$/.test(value) && !value.startsWith("/admin") ? value : "/account";
