# Encargo: velocidad de los jugadores de una liga

Lee `data/raw/<liga>.json` (plantillas 2026/27: `teams[].code`, `teams[].squad[].name`, `pos`, `number`, `nat`) y, para contexto, `data/ratings/<liga>.json` (rol y atributos ya asignados: `[nombre, rol, ovr, fin, lng, hea, dri, pas, cre, def, gk]`).

Escribe `data/ratings/pace/<liga>.json` con este formato exacto:

```json
{
  "RMA": { "Kylian Mbappé": 97, "Thibaut Courtois": 48 },
  "BAR": { "Lamine Yamal": 88 }
}
```

- Una entrada por CADA jugador de la plantilla, con el nombre copiado EXACTAMENTE de `squad[].name`. Enteros 1–99.
- **Velocidad** = aceleración + velocidad punta real (como el PAC de EA FC). Refleja al jugador real, no solo su puesto.
- Referencias: Mbappé 97 · Vinícius Júnior 95 · Alphonso Davies 95 · Kyle Walker 86 · Lamine Yamal 88 · Haaland 89 · Salah 88 · Pedri 74 · Modrić 70 · Virgil van Dijk 76 · Rüdiger 82 · central lento veterano 60 · mediocentro posicional 62–70 · porteros 40–60.
- Si no conoces al jugador, estima con prudencia por puesto, edad aparente (dorsal alto suele ser joven) y perfil del rol: extremos y laterales rápidos 78–88, delanteros 72–85, mediocentros 62–75, centrales 60–75, porteros 40–55.
- No uses búsquedas web salvo, como mucho, 5 para fichajes muy relevantes que no reconozcas.

Al terminar ejecuta `node scripts/validate-pace.mjs <liga>` desde `C:\Users\serve\Downloads\Winner` y corrige hasta que diga OK. No modifiques ningún otro archivo del proyecto. Responde con un resumen breve: los 5 más rápidos de la liga y cualquier duda.
