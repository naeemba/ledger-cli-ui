import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

const uploadDir = path.join(process.cwd(), 'uploads');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const data = await req.formData();
  const file = data.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Ensure the uploads directory exists
  await fs.mkdir(uploadDir, { recursive: true });

  // Write the uploaded file to the uploads directory
  const filePath = path.join(uploadDir, file.name);
  await fs.writeFile(filePath, buffer);

  // Parse the file using Ledger CLI
  return new Promise((resolve) => {
    exec(`ledger -f ${filePath} bal`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${stderr}`);
        resolve(NextResponse.json({ error: stderr }, { status: 500 }));
        return;
      }

      resolve(NextResponse.json({ data: stdout }));
    });
  });
}
