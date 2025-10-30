#!/bin/bash

# Import missing knowledge files from source directory
SOURCE_BASE="c:/Users/ryu91/Desktop/北の達人/広告チェックツール用"
TARGET_BASE="C:/kitano_adchecker/Testproject/knowledge/common"

echo "=== Importing Missing Knowledge Files ==="
echo ""

# Function to copy txt files from nested directories
copy_nested_files() {
    local source_dir="$1"
    local description="$2"
    
    echo "📂 Importing $description..."
    local count=0
    
    # Find all .txt files in nested directories
    while IFS= read -r -d '' file; do
        filename=$(basename "$file")
        target_file="$TARGET_BASE/$filename"
        
        # Only copy if file doesn't exist or is empty
        if [ ! -f "$target_file" ] || [ ! -s "$target_file" ]; then
            cp "$file" "$target_file"
            echo "   ✅ $filename"
            ((count++))
        fi
    done < <(find "$source_dir" -name "*.txt" -type f -print0 2>/dev/null)
    
    echo "   Imported: $count files"
    echo ""
}

# Import 薬機法_行政資料 (Laws - P2)
copy_nested_files "$SOURCE_BASE/薬機法_行政資料/行政資料" "薬機法 行政資料 (Laws)"

# Import 景表法_行政資料 (Guidelines - P3)
copy_nested_files "$SOURCE_BASE/景表法_行政資料/行政資料" "景表法 行政資料 (Guidelines)"

# Import 特商法_行政資料 (Laws - P2)
copy_nested_files "$SOURCE_BASE/特商法_行政資料/行政資料" "特商法 行政資料 (Laws)"

# Import 健増法 (Laws - P2)
copy_nested_files "$SOURCE_BASE/健増法_健康食品、機能性表示食品" "健増法 (Health Promotion Laws)"

# Import 薬機法_民間資料 (Industry Guidelines - P3)
copy_nested_files "$SOURCE_BASE/薬機法_民間資料/民間資料" "薬機法 民間資料 (Industry Guidelines)"

echo "✅ Import complete!"
echo ""
echo "Next steps:"
echo "1. Update priority-mapping.csv"
echo "2. Rebuild Vector DB"
