import { posterPlacements } from "@/lib/platforms/presets";
import styles from "./landing-v2.module.css";

// A small wall of the nine poster sizes, drawn in CSS from the real placement list (single source of truth).
// Each miniature follows the poster rules: a flat field, the name, one picture, the claim in serif and the address in mono.

const fields = [
  { field: "#f1ece6", ink: "#111114" },
  { field: "#173a31", ink: "#f1ece6" },
  { field: "#f06445", ink: "#111114" },
  { field: "#1c1819", ink: "#f1ece6" },
];

const photo = 'url("https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=420&q=70")';

export function LandingPosterWall({ claim, host, sizesLabel }: { claim: string; host: string; sizesLabel: string }) {
  return (
    <div className={styles.wallWrap}>
      <div className={styles.wall} aria-hidden="true">
        {posterPlacements.map((placement, index) => {
          const { field, ink } = fields[index % fields.length];
          const wide = placement.width / placement.height >= 1.25;
          return (
            <div key={placement.id} className={styles.mini} style={{ aspectRatio: `${placement.width} / ${placement.height}`, background: field, color: ink }}>
              <div className={`${styles.miniBody} ${wide ? styles.miniWide : styles.miniTall}`}>
                <b className={styles.miniName}>NORTHLINE</b>
                <i className={styles.miniPicture} style={{ backgroundImage: photo }} />
                <span className={styles.miniClaim}>{claim}</span>
                <small className={styles.miniHost}>{host}</small>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.sizes}>
        <span className={styles.sizesLabel}>{sizesLabel}</span>
        <ul>
          {posterPlacements.map((placement) => (
            <li key={placement.id}><span>{placement.label}</span><b>{placement.width}×{placement.height}</b></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
