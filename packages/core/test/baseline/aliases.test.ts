import ts from 'typescript';
import { expect, it } from 'vitest';

// jsdom's URL mangles file: URLs, so the folder comes from the string itself.
const here = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '').replace(/[^/]*$/, ''));
const consumer = `${here}__consumer__.ts`;

const SOURCE = `
import { hookSubject, rpaSubject } from '../../src/testing/index';
import * as upa from 'upstream-upa';
import usePlacesAutocomplete from 'upstream-upa';
import PlacesAutocomplete from 'upstream-rpa';
export const subjects = [hookSubject(upa), rpaSubject({ default: PlacesAutocomplete })];
export const hook: typeof upa.default = usePlacesAutocomplete;
`;

function consumerDiagnostics(): string[] {
  const config = ts.readConfigFile(`${here}../../tsconfig.json`, ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, `${here}../..`);
  const host = ts.createCompilerHost(options);
  const { fileExists, readFile, getSourceFile } = host;
  host.fileExists = (name) => name === consumer || fileExists(name);
  host.readFile = (name) => (name === consumer ? SOURCE : readFile(name));
  host.getSourceFile = (name, language, ...rest) =>
    name === consumer
      ? ts.createSourceFile(name, SOURCE, language)
      : getSourceFile(name, language, ...rest);
  const program = ts.createProgram({ rootNames: [consumer], options, host });
  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(consumer))
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

it('the testing entry brings the upstream-upa and upstream-rpa aliases to its importers', () => {
  expect(consumerDiagnostics()).toEqual([]);
}, 60_000);
