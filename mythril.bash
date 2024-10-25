#!/bin/bash
# analyze_contracts.sh

# Clean up old files
rm -rf flattened

# Create fresh directories
mkdir -p flattened
mkdir -p reports

# Get current timestamp
timestamp=$(date +"%Y%m%d_%H%M%S")
export timestamp

# Get number of CPU cores
cores=$(nproc)

analyze_contract() {
    contract=$1
    filename=$(basename "$contract")
    
    # Skip interface files
    if [[ $filename == I*.sol ]]; then
        echo "Skipping interface file: $filename"
        return
    fi
    
    echo "🔍 Starting analysis of $filename..."
    
    npx hardhat flatten "$contract" > "flattened/$filename"
    
    # Create a clear section header
    {
        echo "# Security Analysis: $filename"
        echo "## Contract: ${filename%.sol}"
        echo "### Analysis Results"
        echo "---"
        
        # Run analysis and capture all output
        myth analyze "flattened/$filename" \
            --solv 0.8.24 \
            --parallel-solving \
            -t 5 \
            --execution-timeout 300 \
            --max-depth 256 \
            --strategy bfs \
            -o markdown 2>&1 || echo "Analysis failed for $filename"
        
        echo -e "\n---\n"
    } >> "reports/combined_report_${timestamp}.md"
    
    echo "✅ Completed analysis of $filename"
}

export -f analyze_contract

# Add report header
{
    echo "# Mythril Security Analysis Report"
    echo "Generated: $(date)"
    echo -e "\n---\n"
} > "reports/combined_report_${timestamp}.md"

# Use all available cores with progress indication
find contracts -name "*.sol" | parallel --bar -j $cores analyze_contract

# Add report footer
{
    echo -e "\n---\n"
    echo "## Analysis Summary"
    echo "- Total files analyzed: $(find contracts -name "*.sol" ! -name "I*.sol" | wc -l)"
    echo "- Analysis completed: $(date)"
} >> "reports/combined_report_${timestamp}.md"
