#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>

// This script is NOT memory safe
// It's NOT supposed to be used in production!!!

int main() {
  // Open file
  FILE *fptr;
  fptr = fopen("./internal/cloudflare/.env.local", "r");

  // get size
  fseek(fptr, 0, SEEK_END); 
  long size = ftell(fptr);
  fseek(fptr, 0, SEEK_SET); 

  // Store the content of the file
  char* myString = malloc(size);

  // final output
  char* finalArgv[128];
  memset(finalArgv, 0, sizeof finalArgv);

  finalArgv[0] = "bunx";
  finalArgv[1] = "wrangler";
  finalArgv[2] = "dev";
  finalArgv[3] = "--port";
  finalArgv[4] = "7777";
  int finalOffset = 5;

  // Read the content and store it inside myString
  fread(myString, 1, size, fptr);

  char* newlineChar = strtok(myString, "\n");
  while (newlineChar != NULL) {
    if (*newlineChar == '#') {
      newlineChar = strtok(NULL, "\n");
      continue;
    }

    char* equalSign = strstr(newlineChar, "=");
    if (equalSign != NULL) {
      *equalSign = '\0'; //write a null byte at "="
      // printf("VAR: %s === %s\n", lineCopy, equalSign + 1);

      int length = snprintf( NULL, 0, "%s:%s", newlineChar, equalSign + 1);
      char* str = malloc( length + 1 );
      snprintf( str, length + 1, "%s:%s", newlineChar, equalSign + 1);

      *equalSign = '='; //write an equal sign reverting the null byte

      finalArgv[finalOffset] = "--var";
      finalArgv[finalOffset + 1] = str;
      finalOffset += 2;
    }

    newlineChar = strtok(NULL, "\n");
  }

  // for(int loop = 0; loop < 128; loop++) {
  //   char* el = finalArgv[loop];
  //   if (el == NULL) {
  //     break;
  //   };

  //   printf("%s ", el);
  // }

  free(myString);
  fclose(fptr);
  execvp("bunx", finalArgv);
  printf("Oh no, something went wrong with execvp()! %s\n", strerror(errno));
}