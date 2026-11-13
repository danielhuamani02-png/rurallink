"""grafico.py — Dibuja el perfil del radioenlace."""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

AZUL, GRIS, ROJO = "#1F3A5F", "#7B8794", "#C0392B"


def grafico_perfil(res, p, nombre_a="Torre A", nombre_b="Torre B"):
    x, los, r1 = res.x_km, res.los_m, res.r1_m
    fig, ax = plt.subplots(figsize=(10, 4.6), dpi=130)

    piso = min(res.terreno_m.min(), (los - r1).min()) - 15
    ax.fill_between(x, piso, res.terreno_ef_m, color="#C9D3DD",
                    label="Terreno + curvatura (k = %.2f)" % p.k)
    ax.plot(x, res.terreno_m, color=GRIS, lw=0.8, ls=":", label="Terreno real (MDE)")
    ax.fill_between(x, los - r1, los + r1, color="#F2C94C", alpha=0.35,
                    label="1.ª zona de Fresnel")
    ax.plot(x, los - p.despeje_min * r1, color=AZUL, lw=0.9, ls="--",
            label=f"Límite de despeje {p.despeje_min*100:.0f} %")
    ax.plot(x, los, color=AZUL, lw=1.8, label="Línea de vista")

    # torres
    for xi, base, h, txt, ha in [(x[0], res.terreno_m[0], p.h_torre_a, nombre_a, "left"),
                                 (x[-1], res.terreno_m[-1], p.h_torre_b, nombre_b, "right")]:
        ax.plot([xi, xi], [base, base + h], color="black", lw=3)
        ax.text(xi, base + h + 3, f"{txt}\n{h:.0f} m", ha=ha, va="bottom", fontsize=9)

    # peor punto
    i = int(abs(x - res.km_peor_punto).argmin())
    color = AZUL if res.fresnel_ok else ROJO
    ax.scatter([x[i]], [res.terreno_ef_m[i]], color=color, zorder=5, s=30)
    txt = (f"Peor punto: {res.despeje_min_pct:.0f} % de despeje" if res.linea_vista_libre
           else "Obstrucción de la línea de vista")
    ax.annotate(txt, xy=(x[i], res.terreno_ef_m[i]), xytext=(0, -34), textcoords="offset points",
                ha="center", fontsize=9, color=color,
                bbox=dict(boxstyle="round,pad=0.3", fc="white", ec=color, lw=0.8),
                arrowprops=dict(arrowstyle="-", color=color, lw=0.8))

    ax.set_xlim(x[0] - 0.02 * x[-1], x[-1] * 1.02)
    ax.set_ylim(piso, max(los.max() + r1.max(), res.terreno_ef_m.max()) + 25)
    ax.set_xlabel("Distancia (km)")
    ax.set_ylabel("Altitud (m s. n. m.)")
    ax.grid(alpha=0.25)
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), ncol=5, fontsize=8, frameon=False)
    fig.tight_layout()
    return fig
