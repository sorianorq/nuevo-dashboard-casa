/**
 * Roles y Balances (especificación, apartado 2). Tipos y reglas puras,
 * sin acceso a datos: se usan tanto en el servidor como en componentes.
 */

export const ROLES = ["admin", "andrea", "ricardo"] as const;
export type Role = (typeof ROLES)[number];

export const PEOPLE = ["andrea", "ricardo"] as const;
export type Person = (typeof PEOPLE)[number];

export const OWNERS = ["casa", "andrea", "ricardo"] as const;
export type Owner = (typeof OWNERS)[number];

/** Pestaña de Balance: Casa o la persona (el usuario, o la elegida por admin). */
export type BalanceTab = "casa" | "personal";

export const OWNER_LABEL: Record<Owner, string> = {
  casa: "Casa",
  andrea: "Andrea",
  ricardo: "Ricardo",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  andrea: "Andrea",
  ricardo: "Ricardo",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isPerson(value: unknown): value is Person {
  return typeof value === "string" && (PEOPLE as readonly string[]).includes(value);
}

export function isOwner(value: unknown): value is Owner {
  return typeof value === "string" && (OWNERS as readonly string[]).includes(value);
}

/** Balances que puede ver cada rol. */
export function allowedOwners(role: Role): Owner[] {
  if (role === "admin") return ["casa", "andrea", "ricardo"];
  return ["casa", role];
}

export function canSeeOwner(role: Role, owner: Owner): boolean {
  return allowedOwners(role).includes(owner);
}

/**
 * Persona de la pestaña personal. Para andrea/ricardo es siempre su rol
 * (se ignora cualquier preferencia). Para admin, la elegida en el selector.
 */
export function resolvePerson(role: Role, adminChoice: unknown): Person {
  if (role !== "admin") return role;
  return isPerson(adminChoice) ? adminChoice : "andrea";
}

export function parseBalanceTab(value: unknown): BalanceTab {
  return value === "personal" ? "personal" : "casa";
}

/** Mapeo de cuentas: accounts.ownership_scope → Balance. */
export function ownerFromOwnershipScope(scope: string | null): Owner | null {
  if (scope === "common") return "casa";
  if (scope === "andrea" || scope === "ricardo") return scope;
  return null;
}

export function ownershipScopeFromOwner(owner: Owner): "common" | Person {
  return owner === "casa" ? "common" : owner;
}

/** Nombre de la cookie con la persona elegida por admin (solo preferencia de vista). */
export const ADMIN_VIEW_COOKIE = "fc_admin_view";
