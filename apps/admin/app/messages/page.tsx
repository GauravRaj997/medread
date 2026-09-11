import { prisma } from "@medread/db";

async function resolveMessage(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await prisma.contactMessage.update({
    where: { id },
    data: { resolved: true },
  });
}

export default async function MessagesPage() {
  const messages = await prisma.contactMessage.findMany({
    orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
  });

  return (
    <main style={{ padding: 24 }}>
      <h1>Support Messages</h1>
      {messages.map((m) => (
        <div
          key={m.id}
          style={{
            border: "1px solid #ddd",
            padding: 12,
            marginBottom: 12,
            opacity: m.resolved ? 0.5 : 1,
          }}
        >
          <p><strong>{m.email}</strong> {m.subject && `— ${m.subject}`}</p>
          <p>{m.message}</p>
          <p style={{ fontSize: 12, color: "#888" }}>{m.createdAt.toString()}</p>
          {!m.resolved && (
            <form action={resolveMessage}>
              <input type="hidden" name="id" value={m.id} />
              <button type="submit">Mark Resolved</button>
            </form>
          )}
        </div>
      ))}
    </main>
  );
}