export async function executeJob(request: any): Promise<string> {
  const name = request.name || "Anonymous";
  return `Thank you ${name}`;
}
