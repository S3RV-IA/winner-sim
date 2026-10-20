# Encargo: valorar equipos y jugadores de una liga

Lee `data/raw/<liga>.json` (equipos 2026/27 de Wikipedia: `code`, `name`, `previousSeason` con posición y goles de 2025/26 o `null` si es ascendido, y `squad` con `name`, `number`, `pos` GK/DF/MF/FW y `nat`).
Escribe `data/ratings/<liga>.json` con este formato exacto:

```json
{
  "teams": {
    "RMA": {
      "ovr": 97, "att": 97, "ctl": 95, "def": 92,
      "penaltyTaker": "Kylian Mbappé",
      "players": [
        ["Thibaut Courtois", "GK", 89, 10, 10, 20, 15, 65, 40, 20, 90],
        ["Kylian Mbappé", "ST", 92, 95, 84, 74, 92, 80, 82, 30, 8]
      ]
    }
  }
}
```

Columnas de cada jugador: `[nombre, rol, ovr, fin, lng, hea, dri, pas, cre, def, gk]`, todos enteros 1–99.
- **nombre**: cópialo EXACTAMENTE como aparece en `squad[].name` (acentos incluidos). Un registro por cada jugador de la plantilla, ni más ni menos.
- **rol**: uno de `GK CB LB RB DM CM AM LW RW ST` (carrileros → LB/RB; mediapunta → AM; segundo delantero → ST o AM). Respeta GK de Wikipedia.
- **ovr**: calidad global estilo EA FC. Escala: 89–93 elite mundial, 85–88 estrellas, 80–84 titulares de club grande, 72–79 titulares de media tabla de las 5 grandes ligas, 66–72 titulares de equipos modestos/ascendidos, 60–68 titulares de la zona baja de Portugal, 55–65 suplentes jóvenes y terceros porteros.
- **fin** definición en el área · **lng** disparo lejano · **hea** juego aéreo/cabeza · **dri** regate · **pas** precisión de pase · **cre** creación/visión (asistencias) · **def** defensa · **gk** portería (porteros 60–92; jugadores de campo 5–15).
- Los atributos deben reflejar el perfil REAL del jugador, no solo su posición. Ejemplos de referencia:
  - Lamine Yamal RW: 90, fin 82, lng 80, hea 45, dri 96, pas 85, cre 92, def 30, gk 8
  - Pedri CM: 89, fin 70, lng 74, hea 45, dri 88, pas 94, cre 90, def 62, gk 8
  - Erling Haaland ST: 91, fin 96, lng 80, hea 88, dri 78, pas 66, cre 68, def 40, gk 8
  - Virgil van Dijk CB: 88, fin 45, lng 55, hea 90, dri 65, pas 80, cre 60, def 91, gk 8
  - Un central de media tabla: 75, fin 35, lng 40, hea 76, dri 52, pas 66, cre 45, def 77, gk 8
- Si no conoces a un jugador, estima con prudencia según equipo, posición, dorsal y nacionalidad (los dorsales altos suelen ser canteranos/suplentes: ovr bajo). Puedes usar WebSearch con moderación (máx. ~10 búsquedas) solo para fichajes importantes de clubes grandes que no reconozcas.
- **penaltyTaker**: el lanzador habitual (nombre exacto de la plantilla).

**Nivel del equipo** (`ovr`, `att` ataque, `ctl` control/posesión, `def` defensa; 1–100). Usa tu conocimiento del equipo 2026/27 y los goles a favor/en contra de 2025/26 (`previousSeason.gf/ga`). `ovr` ≈ media de los tres; cada uno suele estar a ±6 de `ovr`.
Escala común para TODAS las ligas (deben ser comparables entre sí; el usuario puso de ejemplo Real Madrid 98 y Mallorca 74):
- Élite europea (Real Madrid, Barcelona, Bayern, PSG, Arsenal, Man City, Liverpool…): 93–98
- Aspirantes a Champions de las 5 grandes (Inter, Atlético, Chelsea, Napoli, Dortmund, Leverkusen…): 86–92
- Big 3 de Portugal: 84–88; Braga ~79
- Media tabla Premier: 79–85 · media tabla LaLiga/Bundesliga/Serie A: 77–82 · media tabla Ligue 1: 75–79
- Zona baja/ascendidos de las 5 grandes: 72–76 (Ligue 1: 70–73) · media/baja Portugal: 64–72

Al terminar ejecuta `node scripts/validate-ratings.mjs <liga>` y corrige hasta que diga OK. No modifiques ningún otro archivo. Responde solo con un resumen breve: niveles de los 5 mejores y 3 peores equipos y cualquier duda relevante.
