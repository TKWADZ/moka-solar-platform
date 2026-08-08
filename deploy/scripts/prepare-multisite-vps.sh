#!/usr/bin/env bash
set -eu

current_project_dir="${1:?current project directory is required}"
backup_root="${2:?backup root is required}"
stack_mode="${3:-${STACK_MODE:-pm2}}"

SUDO=""
if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
current_user="$(id -un)"
current_group="$(id -gn)"

moka_root="/var/www/mokasolar"
moka_source="$moka_root/source"
moka_shared="$moka_root/shared"
moka_env_dir="$moka_shared/env"
moka_log_dir="$moka_shared/logs"
moka_backup_dir="$moka_shared/backups"
moka_script_dir="$moka_root/scripts"

web_moi_root="/var/www/web-moi"
web_moi_source="$web_moi_root/source"
web_moi_shared="$web_moi_root/shared"
web_moi_env_dir="$web_moi_shared/env"
web_moi_log_dir="$web_moi_shared/logs"
web_moi_backup_dir="$web_moi_shared/backups"
web_moi_script_dir="$web_moi_root/scripts"

state_file="$backup_root/multisite-state.env"

print_section() {
  echo
  echo "===== $1 ====="
}

ensure_dir() {
  dir_path="$1"
  if [ -n "$SUDO" ]; then
    $SUDO mkdir -p "$dir_path"
    $SUDO chown "$current_user:$current_group" "$dir_path" || true
  else
    mkdir -p "$dir_path"
  fi
}

backup_file() {
  file_path="$1"
  if [ -f "$file_path" ] || [ -L "$file_path" ]; then
    dest_dir="$backup_root$(dirname "$file_path")"
    ensure_dir "$dest_dir"
    if ! cp -a "$file_path" "$dest_dir/" 2>/dev/null; then
      if [ -n "$SUDO" ]; then
        $SUDO cp -a "$file_path" "$dest_dir/"
      else
        cp -a "$file_path" "$dest_dir/"
      fi
    fi
  fi
}

backup_directory_tar() {
  dir_path="$1"
  tar_name="$2"
  if [ -d "$dir_path" ]; then
    tar -C "$(dirname "$dir_path")" -cf "$backup_root/$tar_name" "$(basename "$dir_path")"
  fi
}

first_existing_file() {
  for candidate in "$@"; do
    if [ -f "$candidate" ] || [ -L "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

trim_wrapping_quotes() {
  raw_value="$1"
  case "$raw_value" in
    \"*\")
      raw_value="${raw_value#\"}"
      raw_value="${raw_value%\"}"
      ;;
    \'*\')
      raw_value="${raw_value#\'}"
      raw_value="${raw_value%\'}"
      ;;
  esac
  printf '%s' "$raw_value"
}

extract_env_value() {
  key_name="$1"
  env_path="$2"
  awk -F= -v key_name="$key_name" '
    $1 == key_name {
      sub(/^[^=]*=/, "", $0)
      print
      exit
    }
  ' "$env_path"
}

sanitize_database_url_for_pg_dump() {
  raw_url="$1"
  base_url="${raw_url%%\?*}"

  if [ "$base_url" = "$raw_url" ]; then
    printf '%s\n' "$raw_url"
    return 0
  fi

  query_string="${raw_url#*\?}"
  filtered_query=""
  old_ifs="$IFS"
  IFS='&'
  # shellcheck disable=SC2086
  set -- $query_string
  IFS="$old_ifs"

  for query_part in "$@"; do
    case "$query_part" in
      schema=*)
        ;;
      *)
        if [ -n "$filtered_query" ]; then
          filtered_query="${filtered_query}&${query_part}"
        else
          filtered_query="$query_part"
        fi
        ;;
    esac
  done

  if [ -n "$filtered_query" ]; then
    printf '%s?%s\n' "$base_url" "$filtered_query"
  else
    printf '%s\n' "$base_url"
  fi
}

link_shared_env() {
  rel_path="$1"
  shared_name="$2"
  target_path="$moka_source/$rel_path"
  shared_path="$moka_env_dir/$shared_name"
  source_path="$(first_existing_file "$moka_source/$rel_path" "$current_project_dir/$rel_path" || true)"

  if [ -n "$source_path" ] && [ ! -f "$shared_path" ] && [ ! -L "$shared_path" ]; then
    cp -a "$source_path" "$shared_path"
    chmod 600 "$shared_path" || true
  fi

  if [ -f "$shared_path" ] || [ -L "$shared_path" ]; then
    mkdir -p "$(dirname "$target_path")"
    if [ -e "$target_path" ] && [ ! -L "$target_path" ]; then
      env_backup_dir="$backup_root/env-backups"
      ensure_dir "$env_backup_dir"
      cp -a "$target_path" "$env_backup_dir/$shared_name.bak"
      if ! cmp -s "$target_path" "$shared_path"; then
        echo "Refusing to replace a divergent environment file at $target_path." >&2
        echo "Reconcile it with $shared_path before deploying again." >&2
        return 1
      fi
      rm -f "$target_path"
    elif [ -L "$target_path" ]; then
      rm -f "$target_path"
    fi
    ln -sfn "$shared_path" "$target_path"
  fi
}

detect_postgres_mode() {
  if command -v docker >/dev/null 2>&1; then
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx 'moka_solar_db'; then
      printf '%s\n' 'docker'
      return 0
    fi
  fi

  if [ -n "$SUDO" ] && $SUDO systemctl is-active --quiet postgresql 2>/dev/null; then
    printf '%s\n' 'systemd'
    return 0
  fi

  if command -v pg_isready >/dev/null 2>&1; then
    if pg_isready >/dev/null 2>&1; then
      printf '%s\n' 'direct'
      return 0
    fi
  fi

  printf '%s\n' 'unknown'
}

backup_database() {
  postgres_mode="$1"
  db_backup_path="$backup_root/postgres/mokasolar-production.dump"
  ensure_dir "$(dirname "$db_backup_path")"
  rm -f "$db_backup_path"

  case "$postgres_mode" in
    docker)
      if command -v docker >/dev/null 2>&1; then
        if ! docker exec moka_solar_db sh -lc 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --format=custom' > "$db_backup_path"; then
          echo "PostgreSQL backup failed for Docker database." >&2
          return 1
        fi
      fi
      ;;
    systemd|direct)
      env_source="$(first_existing_file "$current_project_dir/.env" "$current_project_dir/backend/.env" "$current_project_dir/.env.production" "$moka_source/.env" || true)"
      if [ -n "$env_source" ] && command -v pg_dump >/dev/null 2>&1; then
        database_url="$(extract_env_value DATABASE_URL "$env_source" || true)"
        database_url="$(trim_wrapping_quotes "$database_url")"
        database_url="$(sanitize_database_url_for_pg_dump "$database_url")"
        if [ -n "$database_url" ]; then
          pg_dump "$database_url" --no-owner --format=custom > "$db_backup_path" || rm -f "$db_backup_path"
        fi
        if [ ! -s "$db_backup_path" ]; then
          pg_db="$(trim_wrapping_quotes "$(extract_env_value POSTGRES_DB "$env_source" || true)")"
          pg_user="$(trim_wrapping_quotes "$(extract_env_value POSTGRES_USER "$env_source" || true)")"
          pg_pass="$(trim_wrapping_quotes "$(extract_env_value POSTGRES_PASSWORD "$env_source" || true)")"
          pg_host="$(trim_wrapping_quotes "$(extract_env_value POSTGRES_HOST "$env_source" || true)")"
          pg_port="$(trim_wrapping_quotes "$(extract_env_value POSTGRES_PORT "$env_source" || true)")"

          if [ -z "$pg_host" ]; then
            pg_host="127.0.0.1"
          fi
          if [ -z "$pg_port" ]; then
            pg_port="5432"
          fi

          if [ -n "$pg_db" ] && [ -n "$pg_user" ]; then
            PGPASSWORD="$pg_pass" pg_dump \
              -h "$pg_host" \
              -p "$pg_port" \
              -U "$pg_user" \
              -d "$pg_db" \
              --no-owner \
              --format=custom > "$db_backup_path" || rm -f "$db_backup_path"
          fi
        fi
      fi
      ;;
    *)
      echo "PostgreSQL mode could not be determined; refusing deployment without a database backup." >&2
      return 1
      ;;
  esac

  if [ ! -s "$db_backup_path" ]; then
    echo "PostgreSQL backup is missing or empty; refusing deployment." >&2
    return 1
  fi

  if command -v pg_restore >/dev/null 2>&1; then
    if ! pg_restore --list "$db_backup_path" >/dev/null; then
      echo "PostgreSQL backup validation failed; refusing deployment." >&2
      return 1
    fi
  fi

  chmod 600 "$db_backup_path" || true
  echo "PostgreSQL backup created and validated at $db_backup_path"
}

lock_internal_app_ports() {
  ports_to_lock="${1:-3000 4000 3100 4100}"

  if command -v ufw >/dev/null 2>&1; then
    ufw_status="$($SUDO ufw status 2>/dev/null || true)"
    if printf '%s\n' "$ufw_status" | grep -q '^Status: active'; then
      for port in $ports_to_lock; do
        if ! printf '%s\n' "$ufw_status" | grep -Eq "(^|[[:space:]])${port}/tcp([[:space:]]|$).*DENY IN"; then
          $SUDO ufw deny "${port}/tcp" >/dev/null || true
        fi
      done
      return 0
    fi
  fi

  if command -v iptables >/dev/null 2>&1; then
    for port in $ports_to_lock; do
      $SUDO iptables -C INPUT -p tcp --dport "$port" ! -i lo -j DROP 2>/dev/null || \
        $SUDO iptables -I INPUT -p tcp --dport "$port" ! -i lo -j DROP
    done

    if command -v ip6tables >/dev/null 2>&1; then
      for port in $ports_to_lock; do
        $SUDO ip6tables -C INPUT -p tcp --dport "$port" ! -i lo -j DROP 2>/dev/null || \
          $SUDO ip6tables -I INPUT -p tcp --dport "$port" ! -i lo -j DROP
      done
    fi

    if command -v netfilter-persistent >/dev/null 2>&1; then
      $SUDO netfilter-persistent save || true
    elif [ -d /etc/iptables ] && command -v iptables-save >/dev/null 2>&1; then
      ipv4_rules_path="$backup_root/iptables.rules.v4"
      $SUDO iptables-save > "$ipv4_rules_path" || true
      if [ -s "$ipv4_rules_path" ]; then
        $SUDO cp "$ipv4_rules_path" /etc/iptables/rules.v4 || true
      fi

      if command -v ip6tables-save >/dev/null 2>&1; then
        ipv6_rules_path="$backup_root/ip6tables.rules.v6"
        $SUDO ip6tables-save > "$ipv6_rules_path" || true
        if [ -s "$ipv6_rules_path" ]; then
          $SUDO cp "$ipv6_rules_path" /etc/iptables/rules.v6 || true
        fi
      fi
    fi
    return 0
  fi

  return 1
}

active_moka_nginx=""
for nginx_candidate in $($SUDO grep -RIl 'mokasolar.com' /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null || true); do
  active_moka_nginx="$nginx_candidate"
  break
done

postgres_mode="$(detect_postgres_mode)"

print_section "Current production layout"
echo "stack_mode=$stack_mode"
echo "current_project_dir=$current_project_dir"
echo "active_moka_nginx=${active_moka_nginx:-not-found}"
echo "postgres_mode=$postgres_mode"

print_section "Back up current production inputs"
backup_file "$current_project_dir/.env"
backup_file "$current_project_dir/.env.production"
backup_file "$current_project_dir/backend/.env"
backup_file "$current_project_dir/frontend/.env"
backup_file "$current_project_dir/ecosystem.config.js"
backup_file "$current_project_dir/docker-compose.prod.yml"
backup_file "$current_project_dir/docker-compose.yml"
backup_file "$current_project_dir/.github/workflows/deploy.yml"
backup_directory_tar "$current_project_dir/deploy" "deploy-directory.tar"
backup_directory_tar "$current_project_dir/scripts" "scripts-directory.tar"

if [ -n "$active_moka_nginx" ]; then
  backup_file "$active_moka_nginx"
fi

backup_database "$postgres_mode"

print_section "Create multi-site directory layout"
for dir_path in \
  "$moka_root" \
  "$moka_source" \
  "$moka_env_dir" \
  "$moka_log_dir" \
  "$moka_backup_dir" \
  "$moka_script_dir" \
  "$web_moi_root" \
  "$web_moi_source" \
  "$web_moi_env_dir" \
  "$web_moi_log_dir" \
  "$web_moi_backup_dir" \
  "$web_moi_script_dir"
do
  ensure_dir "$dir_path"
done

print_section "Prepare canonical Moka Solar source"
if [ ! -d "$moka_source/.git" ]; then
  if [ -z "$(ls -A "$moka_source" 2>/dev/null || true)" ]; then
    git clone --no-hardlinks "$current_project_dir" "$moka_source"
  else
    tar -C "$current_project_dir" \
      --exclude='.git' \
      --exclude='node_modules' \
      --exclude='.next' \
      --exclude='dist' \
      --exclude='backend/node_modules' \
      --exclude='frontend/node_modules' \
      -cf - . | tar -C "$moka_source" -xf -
    if [ -d "$current_project_dir/.git" ] && [ ! -d "$moka_source/.git" ]; then
      git clone --no-hardlinks "$current_project_dir" "$moka_source.tmp.$$"
      cp -a "$moka_source.tmp.$$/.git" "$moka_source/.git"
      rm -rf "$moka_source.tmp.$$"
    fi
  fi
fi

if [ -d "$moka_source/.git" ] && [ -d "$current_project_dir/.git" ]; then
  git -C "$moka_source" remote set-url origin "$(git -C "$current_project_dir" remote get-url origin)" || true
fi

print_section "Move env files into shared storage"
link_shared_env ".env" ".env"
link_shared_env ".env.local" ".env.local"
link_shared_env ".env.production" ".env.production"
link_shared_env "backend/.env" "backend.env"
link_shared_env "backend/.env.local" "backend.env.local"
link_shared_env "frontend/.env" "frontend.env"
link_shared_env "frontend/.env.local" "frontend.env.local"

print_section "Generate canonical PM2 ecosystem"
cat > "$moka_script_dir/ecosystem.config.js" <<EOF
module.exports = {
  apps: [
    {
      name: 'moka-solar-backend',
      cwd: '$moka_source/backend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 4000,
      },
      out_file: '$moka_log_dir/backend.out.log',
      error_file: '$moka_log_dir/backend.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'moka-solar-frontend',
      cwd: '$moka_source/frontend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3000,
      },
      out_file: '$moka_log_dir/frontend.out.log',
      error_file: '$moka_log_dir/frontend.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
EOF

print_section "Create future web-moi scaffold"
cat > "$web_moi_root/README-DEPLOY.md" <<'EOF'
# web-moi deployment scaffold

This directory is reserved for the next independent website on the VPS.

Suggested layout:
- /var/www/web-moi/source
- /var/www/web-moi/shared/env
- /var/www/web-moi/shared/logs
- /var/www/web-moi/shared/backups
- /var/www/web-moi/scripts

Suggested reserved ports:
- Frontend: 3100
- Backend: 4100

Suggested PM2 names:
- web-moi-backend
- web-moi-frontend

Suggested Nginx file:
- /etc/nginx/sites-available/web-moi

Recommended rollout:
1. Clone the new repository into /var/www/web-moi/source.
2. Upload runtime env files into /var/www/web-moi/shared/env and symlink them into the source tree. Never commit .env, API keys, database passwords, or tokens.
3. Install dependencies inside /var/www/web-moi/source for each app directory that exists, for example npm install in frontend and backend.
4. Run the production build commands for the new project before creating PM2 processes.
5. Create a dedicated PM2 ecosystem file under /var/www/web-moi/scripts with clear process names such as web-moi-frontend and web-moi-backend.
6. Keep internal application ports bound to 127.0.0.1 and proxy public traffic only through Nginx.
7. Copy /etc/nginx/sites-available/web-moi into a real domain-specific server block after DNS is ready, then point it to 127.0.0.1:3100 and 127.0.0.1:4100 or the final chosen ports.
8. Validate with nginx -t before enabling the site publicly.
9. After DNS points correctly, request SSL with certbot or the existing server certificate workflow for the new domain only.
10. If the new site needs PostgreSQL, create a dedicated database and database user instead of sharing the Moka Solar production database.
11. Check health and logs from pm2 status, pm2 logs, /var/www/web-moi/shared/logs, nginx access/error logs, and the new site's health endpoint.
12. Roll back by stopping the new PM2 processes, restoring the previous source snapshot from /var/www/web-moi/shared/backups, and reloading Nginx only after nginx -t succeeds.
EOF

if [ -f "$current_project_dir/deploy/nginx/web-moi.conf.example" ]; then
  $SUDO cp "$current_project_dir/deploy/nginx/web-moi.conf.example" /etc/nginx/sites-available/web-moi
fi

print_section "Prepare Nginx site files"
moka_nginx_canonical="/etc/nginx/sites-available/mokasolar.com"
if [ -n "$active_moka_nginx" ] && [ ! -f "$moka_nginx_canonical" ] && [ "$active_moka_nginx" != "$moka_nginx_canonical" ]; then
  $SUDO cp "$active_moka_nginx" "$moka_nginx_canonical"
fi

if [ -f "$moka_nginx_canonical" ] && [ ! -e /etc/nginx/sites-enabled/mokasolar.com ] && [ "${active_moka_nginx#/etc/nginx/sites-available/}" != "$active_moka_nginx" ]; then
  $SUDO ln -sfn "$moka_nginx_canonical" /etc/nginx/sites-enabled/mokasolar.com
fi

print_section "Lock internal application ports"
if ! lock_internal_app_ports "3000 4000 3100 4100"; then
  echo "WARNING: could not enforce host firewall rules for internal application ports"
fi

print_section "Persist backup copy inside shared storage"
session_backup_dir="$moka_backup_dir/$timestamp"
ensure_dir "$session_backup_dir"
cp -a "$backup_root/." "$session_backup_dir/" || true

print_section "Write deploy state"
cat > "$state_file" <<EOF
STACK_MODE=$stack_mode
PROJECT_DIR=$moka_source
ECOSYSTEM_FILE=$moka_script_dir/ecosystem.config.js
COMPOSE_FILE=$moka_source/docker-compose.prod.yml
LEGACY_PROJECT_DIR=$current_project_dir
POSTGRES_MODE=$postgres_mode
ACTIVE_MOKA_NGINX=${active_moka_nginx:-}
CANONICAL_MOKA_NGINX=$moka_nginx_canonical
WEB_MOI_NGINX=/etc/nginx/sites-available/web-moi
EOF

cp -a "$state_file" "$session_backup_dir/" || true

print_section "Prepared multi-site state"
cat "$state_file"
