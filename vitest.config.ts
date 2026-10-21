import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
    // La prueba de temporada completa usa una base de datos simulada (fake-indexeddb) que es lenta y
    // muy sensible a la carga del ordenador: margen amplio para que no falle por tiempo.
    testTimeout: 1200000,
  },
});
