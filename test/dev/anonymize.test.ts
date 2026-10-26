import { describe, expect, it } from 'vitest';
import { anonymize, leaks, secretsFor } from '../../src/dev/anonymize';

const secrets = secretsFor({ userid: '2412345', nameAr: 'خالد ناصر الحربي', nameEn: 'Khalid Nasser Alharbi', email: 'khalid77@example.net', firstName: 'خالد' });

describe('anonymize', () => {
  it('removes names, parts of names, email and ID', () => {
    const html = `<span>خالد's Student Center</span><span>خالد ناصر الحربي</span>
      <span>KHALID NASSER ALHARBI</span><b>Khalid</b> id=2412345 <a href="mailto:khalid77@example.net">x</a>`;
    const out = anonymize(html, secrets);
    expect(leaks(out, secrets)).toEqual([]);
    expect(out).toContain("أحمد's Student Center");
    expect(out).toContain('أحمد صالح العتيبي');
    expect(out).toContain('student@example.com');
    expect(out).toContain('20000000');
  });

  it('replaces whole words only, leaving markup intact', () => {
    const s = secretsFor({ userid: '99', nameEn: 'Ali Hassan' });
    const out = anonymize('<td valign="top" align="left">Ali</td><td>Alignment</td>', s);
    expect(out).toBe('<td valign="top" align="left">Ahmed</td><td>Alignment</td>');
  });

  it('drops what the page says about the college servers', () => {
    const page = `<html><!-- OTHERS/0/WIN; ToolsRel=8.60; User=1; DB=PROD/ORACLE; AppServ=//10.0.0.1:9000; -->
<DIV id='pt_envinfo_win0' DB='PROD/ORACLE' AppServ='//10.0.0.1:9000'></DIV><span id="X">kept</span></html>`;
    const out = anonymize(page, []);
    expect(out).not.toMatch(/AppServ|PROD|10\.0\.0\.1|ToolsRel/);
    expect(out).toContain('<span id="X">kept</span>');
  });

  it('scrubs session tokens', () => {
    const out = anonymize('<input type=hidden name="ICSID" value="abc123secret"><input name=\'lcsrf_token\' value=\'zz\'>', []);
    expect(out).not.toContain('abc123secret');
    expect(out).not.toContain("'zz'");
  });
});
