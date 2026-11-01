// Cleans up existing users whose city and province disagree (e.g. "Brampton, BC").
//
//   node run-address-cleanup.js            -> dry run: prints what WOULD change, writes nothing
//   node run-address-cleanup.js --apply    -> applies the changes
//
// Rules, in order:
//  1. City is trimmed and title-cased ("brampton " -> "Brampton").
//  2. If the postal code is valid but its first letter doesn't belong to the
//     user's province, the province is corrected: to the province that city
//     is normally in (the majority of other users in that city whose postal
//     code agrees). If the city is unknown the row is only reported.
//  3. Rows with an unusable postal code or an unknown city are only REPORTED —
//     never guessed at.
const pool = require('./config/db');
const { POSTAL_RE, POSTAL_LETTER_PROVINCES, tidyCity } = require('./utils/places');

const apply = process.argv.includes('--apply');

async function main() {
    console.log(apply ? 'MODE: apply' : 'MODE: dry run (nothing is written)');
    const [users] = await pool.query('SELECT user_id, email, city, province, postal_code FROM users WHERE deleted_at IS NULL');
    const letterOk = (u) => (POSTAL_LETTER_PROVINCES[String(u.postal_code).trim().charAt(0).toUpperCase()] || []).includes(u.province);

    // Which province is each city normally in? (only users whose postal code agrees with their province vote)
    const votes = {};
    for (const u of users) {
        if (!POSTAL_RE.test(u.postal_code || '') || !letterOk(u)) continue;
        const key = tidyCity(u.city).toLowerCase();
        votes[key] = votes[key] || {};
        votes[key][u.province] = (votes[key][u.province] || 0) + 1;
    }
    const cityProvince = (city) => {
        const v = votes[tidyCity(city).toLowerCase()];
        if (!v) return null;
        const [best] = Object.entries(v).sort((a, b) => b[1] - a[1]);
        return best[0];
    };

    let changed = 0;
    const report = [];
    for (const u of users) {
        const newCity = tidyCity(u.city);
        let newProvince = u.province;
        let note = '';

        if (!POSTAL_RE.test(u.postal_code || '')) {
            if (newCity !== u.city) note = 'city tidied';
            report.push(`  #${u.user_id} ${u.email}: unusable postal code "${u.postal_code}" (${newCity}, ${u.province}) - left for review`);
        } else if (!letterOk(u)) {
            const fromCity = cityProvince(u.city);
            if (fromCity) {
                newProvince = fromCity;
                note = `province ${u.province} -> ${newProvince} (where ${newCity} normally is)`;
            } else {
                report.push(`  #${u.user_id} ${u.email}: "${newCity}, ${u.province}" does not match postal code ${u.postal_code}, and the city is unknown - left for review`);
            }
        }
        if (newCity !== u.city && !note) note = `city "${u.city}" -> "${newCity}"`;
        else if (newCity !== u.city) note += `, city "${u.city}" -> "${newCity}"`;

        if (note && (newCity !== u.city || newProvince !== u.province)) {
            console.log(`#${u.user_id} ${u.email}: ${note}`);
            changed++;
            if (apply) await pool.query('UPDATE users SET city = ?, province = ?, neighbourhood_id = NULL WHERE user_id = ?', [newCity, newProvince, u.user_id]);
        }
    }
    console.log(`\n${changed} user(s) ${apply ? 'updated' : 'would be updated'}.`);
    if (report.length) { console.log('\nNeeds a manual look (not changed):'); report.forEach((l) => console.log(l)); }
    await pool.end();
}

main().catch((err) => { console.error('Cleanup failed:', err.message); process.exit(1); });
