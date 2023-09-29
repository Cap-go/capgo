#!/bin/bash

# Parameters
TABLE_NAME=$1
DAYS_OLD=$2
COLUMN_NAME=$3
PG_CONN_STRING=$4
REPO_URL=$5

# Get current date
CURRENT_DATE=$(date +%Y%m%d)

# Export data from Postgres
EXPORT_FILE="export_${CURRENT_DATE}.csv"
PGPASSWORD=$(echo $PG_CONN_STRING | cut -d':' -f3 | cut -d'@' -f1) psql "$PG_CONN_STRING" -c "\copy (SELECT * FROM $TABLE_NAME WHERE $COLUMN_NAME < NOW() - INTERVAL '$DAYS_OLD days') TO '${EXPORT_FILE}' WITH CSV HEADER"

# Split the file into 2GB chunks
mkdir chunks
split -b 2G ${EXPORT_FILE} "chunks/chunk_${CURRENT_DATE}_"

# Clone the other repository
git clone ${REPO_URL} backup_repo

# Move the chunks to the other repository
mv chunks/* backup_repo/

# Upload to GitHub LFS
cd backup_repo
for file in *
do
    git lfs track "$file" # Add to mac with brew install git-lfs
    git add "$file"
done

git add .gitattributes

git commit -m "Add data chunks ${CURRENT_DATE}"
git push origin main

# Go back to the original directory
cd ..

# Remove the data exported from db
PGPASSWORD=$(echo $PG_CONN_STRING | cut -d':' -f3 | cut -d'@' -f1) psql "$PG_CONN_STRING" -c "DELETE FROM $TABLE_NAME WHERE $COLUMN_NAME < NOW() - INTERVAL '$DAYS_OLD days'"

# Remove the exported and chunked files
rm ${EXPORT_FILE}
rm -r chunks/
rm -r backup_repo/
