import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeDockerfile } from "../src/lib/analysis/dockerfile";

test("null content → present=false with empty facts", () => {
  const f = analyzeDockerfile(null);
  assert.equal(f.present, false);
  assert.equal(f.lastUser, null);
  assert.deepEqual(f.secretHits, []);
  assert.deepEqual(f.exposedPorts, []);
});

test("hardcoded secrets in ENV/ARG are detected with line numbers", () => {
  const f = analyzeDockerfile("FROM x\nENV API_KEY=abc\nARG TOKEN=zzz\nENV PATH=/usr/bin");
  assert.equal(f.secretHits.length, 2);
  assert.deepEqual(f.secretHits.map((h) => h.line).sort(), [2, 3]);
});

test("empty ARG declaration (no value) is not a secret", () => {
  const f = analyzeDockerfile("FROM x\nARG API_KEY");
  assert.equal(f.secretHits.length, 0);
});

test("base tag parsing: latest, explicit, none, digest", () => {
  assert.equal(analyzeDockerfile("FROM ubuntu:latest").baseTag, "latest");
  assert.equal(analyzeDockerfile("FROM ubuntu:24.04").baseTag, "24.04");
  assert.equal(analyzeDockerfile("FROM ubuntu").baseTag, null);
  const pinned = analyzeDockerfile("FROM ubuntu@sha256:" + "a".repeat(64));
  assert.equal(pinned.baseDigestPinned, true);
  assert.equal(pinned.baseTag, null);
});

test("registry port colon is not mistaken for a tag", () => {
  const f = analyzeDockerfile("FROM registry.local:5000/team/app");
  assert.equal(f.baseTag, null);
  assert.equal(f.baseImage, "registry.local:5000/team/app");
});

test("FROM ... AS name strips the alias", () => {
  const f = analyzeDockerfile("FROM node:20 AS build");
  assert.equal(f.baseImage, "node:20");
  assert.equal(f.baseTag, "20");
});

test("last USER directive wins", () => {
  const f = analyzeDockerfile("FROM x\nUSER root\nRUN y\nUSER app");
  assert.equal(f.lastUser, "app");
});

test("EXPOSE parses ports and ignores protocol suffix", () => {
  const f = analyzeDockerfile("FROM x\nEXPOSE 22 8080/tcp 3306");
  assert.deepEqual(f.exposedPorts, [22, 8080, 3306]);
});

test("HEALTHCHECK presence and NONE handling", () => {
  assert.equal(analyzeDockerfile("FROM x\nHEALTHCHECK CMD true").hasHealthcheck, true);
  assert.equal(analyzeDockerfile("FROM x\nHEALTHCHECK NONE").hasHealthcheck, false);
  assert.equal(analyzeDockerfile("FROM x").hasHealthcheck, false);
});

test("remote-URL ADD is flagged, local ADD is not", () => {
  const f = analyzeDockerfile("FROM x\nADD https://h/a.sh /a.sh\nADD ./local /dst");
  assert.equal(f.remoteAdds.length, 1);
  assert.equal(f.remoteAdds[0].line, 2);
});

test("comments are ignored", () => {
  const f = analyzeDockerfile("# ENV API_KEY=abc\nFROM x");
  assert.equal(f.secretHits.length, 0);
});
