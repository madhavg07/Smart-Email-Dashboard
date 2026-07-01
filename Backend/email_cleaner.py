import re
import dns.resolver
import csv
import time
from concurrent.futures import ThreadPoolExecutor

def check_email_dns_safe(email):
    email = email.lower().strip()
    regex = r'^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
    
    if not re.match(regex, email):
        return False
        
    domain = email.split('@')[1]
    
    try:
        # Reduced lifetime/timeout slightly to speed up dead domains
        resolver = dns.resolver.Resolver()
        resolver.timeout = 2.0
        resolver.lifetime = 2.0
        resolver.resolve(domain, 'MX')
        return True
    except dns.resolver.NXDOMAIN:
        return False
    except dns.resolver.NoAnswer:
        return False
    except Exception:
        # Default to True on timeout/error to save the genuine emails
        return True

def process_row(row):
    """Worker function for the thread pool"""
    if len(row) > 0:
        email = row[0]
        if check_email_dns_safe(email):
            return row
    return None

def clean_csv_fast(input_file, output_file):
    start_time = time.time()
    print("Starting fast DNS verification...")
    
    with open(input_file, 'r', encoding='utf-8') as infile, open(output_file, 'w', newline='', encoding='utf-8') as outfile:
        reader = list(csv.reader(infile)) # Load into memory for threading
        writer = csv.writer(outfile)
        
        # Write header
        if len(reader) > 0:
            writer.writerow(reader.pop(0))
            
        total_rows = len(reader)
        print(f"Loaded {total_rows} emails. Blasting through network requests...")
        
        valid_count = 0
        
        # Open 100 parallel network connections
        with ThreadPoolExecutor(max_workers=100) as executor:
            # map() keeps the results in the exact same order as the input
            results = executor.map(process_row, reader)
            
            for res in results:
                if res:
                    writer.writerow(res)
                    valid_count += 1
                    
        elapsed = round(time.time() - start_time, 2)
        print(f"\nDone! Kept {valid_count} out of {total_rows} emails.")
        print(f"Total execution time: {elapsed} seconds.")

if __name__ == "__main__":
    clean_csv_fast('raw_emails.csv', 'clean_emails_safe.csv')