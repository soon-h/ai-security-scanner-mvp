import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTomcat } from "../src/lib/analysis/tomcat";

test("null/empty config → present=false", () => {
  assert.equal(analyzeTomcat(null).present, false);
  assert.equal(analyzeTomcat("   ").present, false);
});

test("DefaultServlet listings param (W-01)", () => {
  const on = "<param-name>listings</param-name><param-value>true</param-value>";
  const off = "<param-name>listings</param-name><param-value>false</param-value>";
  assert.equal(analyzeTomcat(on).listingsOn, true);
  assert.equal(analyzeTomcat(off).listingsOn, false);
  assert.equal(analyzeTomcat("<web-app></web-app>").listingsOn, false);
});

test("AccessLogValve detection (W-08)", () => {
  assert.equal(
    analyzeTomcat('<Valve className="org.apache.catalina.valves.AccessLogValve" />').hasAccessLogValve,
    true,
  );
  assert.equal(
    analyzeTomcat('<Valve className="org.apache.catalina.valves.ExtendedAccessLogValve" />').hasAccessLogValve,
    true,
  );
  assert.equal(analyzeTomcat('<Valve className="org.apache.catalina.valves.RemoteIpValve" />').hasAccessLogValve, false);
});

test("error-page detection (W-09)", () => {
  assert.equal(analyzeTomcat("<error-page><error-code>404</error-code></error-page>").hasErrorPage, true);
  assert.equal(analyzeTomcat("<web-app></web-app>").hasErrorPage, false);
});

test("Connector server attribute override (W-26)", () => {
  assert.equal(analyzeTomcat('<Connector port="8080" server="WebServer" />').serverAttrOverridden, true);
  assert.equal(analyzeTomcat('<Connector port="8080" protocol="HTTP/1.1" />').serverAttrOverridden, false);
});

test("DefaultServlet readonly param and security-constraint (W-25)", () => {
  const risky = "<param-name>readonly</param-name><param-value>false</param-value>";
  const safe = "<param-name>readonly</param-name><param-value>true</param-value>";
  assert.equal(analyzeTomcat(risky).readonlyExplicitFalse, true);
  assert.equal(analyzeTomcat(safe).readonlyExplicitTrue, true);
  assert.equal(analyzeTomcat("<security-constraint></security-constraint>").hasSecurityConstraint, true);
  assert.equal(analyzeTomcat("<web-app></web-app>").readonlyExplicitFalse, false);
});

test("commented-out directives are ignored", () => {
  const f = analyzeTomcat("<!-- <param-name>listings</param-name><param-value>true</param-value> -->");
  assert.equal(f.listingsOn, false);
});
