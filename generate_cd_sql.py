import csv, sys, datetime, re

user_id = "auth0|69e8ae41a70a7624924b40c7"

def esc(s):
    if s is None: return 'NULL'
    return "'" + str(s).replace("'", "''") + "'"

def parse_date(s):
    s = s.strip()
    if not s: return 'NULL'
    for fmt in ('%d-%b-%Y', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            d = datetime.datetime.strptime(s, fmt)
            return "'" + d.strftime('%Y-%m-%d') + "'"
        except:
            pass
    return 'NULL'

def parse_bool(s):
    return 'TRUE' if str(s).strip() == '1' else 'FALSE'

def parse_rating(s):
    s = str(s).strip()
    try:
        v = float(s)
        return str(v)
    except:
        return 'NULL'

def rs_tier(row, offset=0):
    cols = [str(row[offset+i]).strip() if offset+i < len(row) else '' for i in range(4)]
    if cols[0] == '1': return "'top-50'"
    if cols[1] == '1': return "'51-100'"
    if cols[2] == '1': return "'101-250'"
    if cols[3] == '1': return "'251-500'"
    return 'NULL'

lines = []

# ── top_albums ──────────────────────────────────────────────────────────────
lines.append('-- ============================================================')
lines.append('-- cd_albums (owned top albums)')
lines.append('-- ============================================================')

with open('C:/Users/Owner/Downloads/CDcatalogue  top albums.csv', encoding='latin-1', newline='') as f:
    reader = csv.reader(f)
    next(reader)  # skip header
    rows_inserted = 0
    for row in reader:
        if len(row) < 5:
            continue
        title = str(row[4]).strip() if len(row) > 4 else ''
        artist = str(row[2]).strip() if len(row) > 2 else ''
        if not title or not artist:
            continue
        seq_num = str(row[0]).strip()
        seq_val = int(seq_num) if seq_num.isdigit() else 'NULL'
        release_date = parse_date(row[1]) if len(row) > 1 else 'NULL'
        year_s = str(row[3]).strip() if len(row) > 3 else ''
        year_val = int(year_s) if year_s.isdigit() else 'NULL'
        publisher = esc(str(row[5]).strip()) if len(row) > 5 else 'NULL'
        rating = parse_rating(row[6]) if len(row) > 6 else 'NULL'
        album_pick = parse_bool(row[7]) if len(row) > 7 else 'FALSE'
        star5 = parse_bool(row[8]) if len(row) > 8 else 'FALSE'
        star45 = parse_bool(row[9]) if len(row) > 9 else 'FALSE'
        tier = rs_tier(row, 10) if len(row) > 13 else 'NULL'
        rs500_val = str(row[14]).strip() if len(row) > 14 else ''
        rs500 = 'TRUE' if rs500_val == '1' else ('FALSE' if rs500_val == '0' else 'NULL')
        lines.append(
            "INSERT INTO cd_albums (user_id, seq_num, release_date, artist, year, title, publisher, allmusic_rating, album_pick, is_5star, is_4half_star, rs_tier, rs_top500) VALUES "
            "(" + esc(user_id) + ", " + str(seq_val) + ", " + release_date + ", " + esc(artist) + ", " + str(year_val) + ", " + esc(title) + ", " + publisher + ", " + rating + ", " + album_pick + ", " + star5 + ", " + star45 + ", " + tier + ", " + rs500 + ");"
        )
        rows_inserted += 1

lines.append('-- ' + str(rows_inserted) + ' albums inserted')
lines.append('')

# ── top_compilations ─────────────────────────────────────────────────────────
lines.append('-- ============================================================')
lines.append('-- cd_compilations')
lines.append('-- ============================================================')

with open('C:/Users/Owner/Downloads/CDcatalogue  top compilations.csv', encoding='latin-1', newline='') as f:
    reader = csv.reader(f)
    next(reader)  # skip header
    rows_inserted = 0
    for row in reader:
        if len(row) < 5:
            continue
        title = str(row[4]).strip() if len(row) > 4 else ''
        artist = str(row[2]).strip() if len(row) > 2 else ''
        if not title or not artist:
            continue
        seq_num = str(row[0]).strip()
        seq_val = int(seq_num) if seq_num.isdigit() else 'NULL'
        release_date = parse_date(row[1]) if len(row) > 1 else 'NULL'
        year_s = str(row[3]).strip() if len(row) > 3 else ''
        year_val = int(year_s) if year_s.isdigit() else 'NULL'
        publisher = esc(str(row[5]).strip()) if len(row) > 5 else 'NULL'
        rating = parse_rating(row[6]) if len(row) > 6 else 'NULL'
        album_pick = parse_bool(row[7]) if len(row) > 7 else 'FALSE'
        star5 = parse_bool(row[8]) if len(row) > 8 else 'FALSE'
        star45 = parse_bool(row[9]) if len(row) > 9 else 'FALSE'
        lines.append(
            "INSERT INTO cd_compilations (user_id, seq_num, release_date, artist, year, title, publisher, allmusic_rating, album_pick, is_5star, is_4half_star) VALUES "
            "(" + esc(user_id) + ", " + str(seq_val) + ", " + release_date + ", " + esc(artist) + ", " + str(year_val) + ", " + esc(title) + ", " + publisher + ", " + rating + ", " + album_pick + ", " + star5 + ", " + star45 + ");"
        )
        rows_inserted += 1

lines.append('-- ' + str(rows_inserted) + ' compilations inserted')
lines.append('')

# ── wishlist ──────────────────────────────────────────────────────────────────
lines.append('-- ============================================================')
lines.append('-- cd_wishlist')
lines.append('-- ============================================================')

with open('C:/Users/Owner/Downloads/CDcatalogue  wishlist.csv', encoding='latin-1', newline='') as f:
    reader = csv.reader(f)
    next(reader)  # skip header
    rows_inserted = 0
    for row in reader:
        if len(row) < 5:
            continue
        title = str(row[4]).strip() if len(row) > 4 else ''
        artist = str(row[2]).strip() if len(row) > 2 else ''
        if not title or not artist:
            continue
        release_date = parse_date(row[1]) if len(row) > 1 else 'NULL'
        year_s = str(row[3]).strip() if len(row) > 3 else ''
        year_val = int(year_s) if year_s.isdigit() else 'NULL'
        publisher = esc(str(row[5]).strip()) if len(row) > 5 else 'NULL'
        rating = parse_rating(row[6]) if len(row) > 6 else 'NULL'
        album_pick = parse_bool(row[7]) if len(row) > 7 else 'FALSE'
        star5 = parse_bool(row[8]) if len(row) > 8 else 'FALSE'
        star45 = parse_bool(row[9]) if len(row) > 9 else 'FALSE'
        star4 = parse_bool(row[10]) if len(row) > 10 else 'FALSE'
        tier = rs_tier(row, 11) if len(row) > 14 else 'NULL'
        rs500_val = str(row[15]).strip() if len(row) > 15 else ''
        rs500 = 'TRUE' if rs500_val == '1' else ('FALSE' if rs500_val == '0' else 'NULL')
        lines.append(
            "INSERT INTO cd_wishlist (user_id, release_date, artist, year, title, publisher, allmusic_rating, album_pick, is_5star, is_4half_star, is_4star, rs_tier, rs_top500) VALUES "
            "(" + esc(user_id) + ", " + release_date + ", " + esc(artist) + ", " + str(year_val) + ", " + esc(title) + ", " + publisher + ", " + rating + ", " + album_pick + ", " + star5 + ", " + star45 + ", " + star4 + ", " + tier + ", " + rs500 + ");"
        )
        rows_inserted += 1

lines.append('-- ' + str(rows_inserted) + ' wishlist entries inserted')
lines.append('')

# ── RS 2012 ───────────────────────────────────────────────────────────────────
lines.append('-- ============================================================')
lines.append('-- cd_rs_2012')
lines.append('-- ============================================================')

with open('C:/Users/Owner/Downloads/CDcatalogue  RS 1-500 albums 2012.csv', encoding='latin-1', newline='') as f:
    reader = csv.reader(f)
    rows_inserted = 0
    for row in reader:
        if not row or not str(row[0]).strip():
            continue
        entry = str(row[0]).strip()
        m = re.match(r'^(\d+)\.\s+(.+)$', entry)
        if not m:
            continue
        rank = int(m.group(1))
        owned = parse_bool(row[1]) if len(row) > 1 and str(row[1]).strip() else 'FALSE'
        lines.append(
            "INSERT INTO cd_rs_2012 (user_id, rs_rank, entry_text, owned) VALUES "
            "(" + esc(user_id) + ", " + str(rank) + ", " + esc(entry) + ", " + owned + ");"
        )
        rows_inserted += 1

lines.append('-- ' + str(rows_inserted) + ' RS 2012 entries inserted')
lines.append('')

# ── RS 2020 ───────────────────────────────────────────────────────────────────
lines.append('-- ============================================================')
lines.append('-- cd_rs_2020')
lines.append('-- ============================================================')

with open('C:/Users/Owner/Downloads/CDcatalogue  RS 1-500 albums 2020.csv', encoding='latin-1', newline='') as f:
    reader = csv.reader(f)
    rows_inserted = 0
    for row in reader:
        if not row or not str(row[0]).strip():
            continue
        entry = str(row[0]).strip()
        m = re.match(r'^(\d+)\.\s+(.+)$', entry)
        if not m:
            continue
        rank = int(m.group(1))
        owned = parse_bool(row[1]) if len(row) > 1 and str(row[1]).strip() else 'FALSE'
        lines.append(
            "INSERT INTO cd_rs_2020 (user_id, rs_rank, entry_text, owned) VALUES "
            "(" + esc(user_id) + ", " + str(rank) + ", " + esc(entry) + ", " + owned + ");"
        )
        rows_inserted += 1

lines.append('-- ' + str(rows_inserted) + ' RS 2020 entries inserted')

sys.stdout.buffer.write('\n'.join(lines).encode('utf-8'))
