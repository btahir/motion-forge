export const TEMPLATE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <title>New animation</title>
  <desc>Replace this artwork and motion. Every element you animate needs an id or class.</desc>
  <ellipse id="shadow" cx="120" cy="196" rx="44" ry="8" fill="#e4dfd6"/>
  <g id="shape">
    <rect x="80" y="84" width="80" height="80" rx="22" fill="#ff5a1f"/>
    <circle class="eye" cx="106" cy="118" r="6" fill="#1d1a16"/>
    <circle class="eye" cx="134" cy="118" r="6" fill="#1d1a16"/>
  </g>
  <metadata type="application/motion+json"><![CDATA[
  {
    "states": {
      "idle": {
        "duration": 2400,
        "loop": true,
        "animate": {
          "#shape": { "translateY": [0, -8, 0] },
          "#shadow": { "scale": [1, 0.86, 1] }
        },
        "on": { "hop": "hop" }
      },
      "hop": {
        "duration": 700,
        "animate": {
          "#shape": {
            "translateY": { "0%": 0, "18%": 6, "50%": { "value": -46, "ease": "out" }, "82%": { "value": 0, "ease": "in" } },
            "scaleY": { "0%": 1, "18%": 0.82, "40%": 1.08, "80%": 1, "88%": 0.86, "100%": 1 },
            "origin": "bottom"
          },
          "#shadow": { "scale": { "0%": 1, "50%": 0.6, "100%": 1 } }
        },
        "next": "idle"
      }
    },
    "layers": {
      "blink": {
        "states": {
          "open": { "duration": 3600, "loop": true, "animate": { ".eye": { "scaleY": { "0%": 1, "90%": 1, "93%": 0.1, "96%": 1 } } } }
        }
      }
    },
    "interactions": [{ "on": "click", "target": "#shape", "send": "hop" }]
  }
  ]]></metadata>
</svg>
`;
