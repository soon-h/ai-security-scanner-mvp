import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScanRecord } from "./types";

// 단일 사용자 로컬 MVP라 경량 JSON 파일 저장 (spec §9). 파일 하나에 스캔 하나.
const DATA_DIR = path.join(process.cwd(), "data", "scans");

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function fileFor(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export async function saveScan(scan: ScanRecord): Promise<void> {
  await ensureDir();
  scan.updatedAt = new Date().toISOString();
  await fs.writeFile(fileFor(scan.id), JSON.stringify(scan, null, 2), "utf8");
}

export async function getScan(id: string): Promise<ScanRecord | null> {
  try {
    const raw = await fs.readFile(fileFor(id), "utf8");
    return JSON.parse(raw) as ScanRecord;
  } catch {
    return null;
  }
}

export async function listScans(): Promise<ScanRecord[]> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  const scans: ScanRecord[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, f), "utf8");
      scans.push(JSON.parse(raw) as ScanRecord);
    } catch {
      // 손상된 파일은 건너뛴다
    }
  }
  scans.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return scans;
}
