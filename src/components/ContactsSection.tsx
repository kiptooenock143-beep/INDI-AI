import { useEffect, useState } from "react";
import { Phone, MessageSquare, Trash2, Bot, User, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Contact, ContactKind, listContacts, saveContact, deleteContact } from "@/lib/contacts";

const ContactsSection = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ContactKind>("person");
  const [number, setNumber] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    const load = () => setContacts(listContacts());
    load();
    window.addEventListener("exile:contacts", load);
    return () => window.removeEventListener("exile:contacts", load);
  }, []);

  const add = () => {
    if (!name.trim()) return toast.error("Name required.");
    if (!number.trim()) return toast.error(kind === "person" ? "Phone number required." : "Agent endpoint required.");
    saveContact({
      id: crypto.randomUUID(),
      name: name.trim(),
      kind,
      number: kind === "person" ? number.trim() : undefined,
      endpoint: kind === "agent" ? number.trim() : undefined,
      role: role.trim() || undefined,
      createdAt: Date.now(),
    });
    setName(""); setNumber(""); setRole("");
    toast.success("Contact allocated.");
  };

  return (
    <div className="p-4 space-y-5 text-cyan-100">
      <div>
        <h3 className="text-sm tracking-[0.3em] text-cyan-300">CONTACTS</h3>
        <p className="text-xs text-cyan-400/60 mt-1">
          Allocate the people and agents INDI AI is allowed to call or message.
        </p>
      </div>

      <div className="rounded-md border border-cyan-500/25 bg-slate-900/60 p-4 space-y-3">
        <div className="flex gap-2">
          {(["person", "agent"] as ContactKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`flex-1 rounded-md border py-2 text-[10px] tracking-[0.25em] uppercase ${
                kind === k ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100" : "border-cyan-500/20 text-cyan-400/70"
              }`}
            >
              {k === "person" ? "Person" : "AI Agent"}
            </button>
          ))}
        </div>
        <Input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder={kind === "person" ? "Contact name" : "Agent name (e.g. Research Unit)"}
          className="bg-slate-950 border-cyan-500/30 text-cyan-100"
        />
        <Input
          value={number} onChange={(e) => setNumber(e.target.value)}
          placeholder={kind === "person" ? "+254700000000" : "https://agent-endpoint or room id"}
          className="bg-slate-950 border-cyan-500/30 text-cyan-100"
        />
        <Input
          value={role} onChange={(e) => setRole(e.target.value)}
          placeholder="Role / notes (optional)"
          className="bg-slate-950 border-cyan-500/30 text-cyan-100"
        />
        <Button onClick={add} className="w-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-100">
          <Plus className="w-4 h-4 mr-2" /> Allocate contact
        </Button>
      </div>

      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {contacts.length === 0 && <p className="text-xs text-cyan-400/50">No contacts allocated yet.</p>}
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-md border border-cyan-500/20 bg-slate-900/50 p-3">
            <div className="w-8 h-8 rounded-full border border-cyan-500/30 flex items-center justify-center text-cyan-300">
              {c.kind === "agent" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{c.name}</div>
              <div className="text-[10px] text-cyan-400/60 truncate">
                {c.number || c.endpoint}{c.role ? ` · ${c.role}` : ""}
              </div>
            </div>
            {c.kind === "person" && c.number && (
              <>
                <a href={`tel:${c.number}`} aria-label={`Call ${c.name}`} className="text-cyan-300 hover:text-cyan-100">
                  <Phone className="w-4 h-4" />
                </a>
                <a
                  href={`https://wa.me/${c.number.replace(/[^\d]/g, "")}`}
                  target="_blank" rel="noreferrer"
                  aria-label={`Message ${c.name}`}
                  className="text-cyan-300 hover:text-cyan-100"
                >
                  <MessageSquare className="w-4 h-4" />
                </a>
              </>
            )}
            <button onClick={() => deleteContact(c.id)} aria-label="Delete contact" className="text-red-300/70 hover:text-red-200">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContactsSection;
