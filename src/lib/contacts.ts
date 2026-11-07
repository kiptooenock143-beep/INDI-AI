/** Contacts INDI AI can call — people and other AI agents. */

export type ContactKind = "person" | "agent";

export interface Contact {
  id: string;
  name: string;
  kind: ContactKind;
  /** phone number for people (E.164 preferred) */
  number?: string;
  /** endpoint / room / handle for agents */
  endpoint?: string;
  role?: string;
  createdAt: number;
}

const KEY = "exile.contacts";

export function listContacts(): Contact[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(all: Contact[]) {
  localStorage.setItem(KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("exile:contacts"));
}

export function saveContact(c: Contact) {
  write([...listContacts().filter((x) => x.id !== c.id), c]);
}

export function deleteContact(id: string) {
  write(listContacts().filter((c) => c.id !== id));
}
