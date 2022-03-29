<script setup>
import { IonContent, IonPage } from '@ionic/vue'
import Header from '~/components/header.vue'
import Footer from '~/components/footer.vue'
</script>

<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <div class="overflow-x-hidden bg-gray-900 text-white">
        <Header />
        <section class="xl:mx-auto font-fira-sans mx-4 lg:max-w-[85%]">
          <div class="md:my-20 flex justify-between">
            <div class="w-full md:w-1/2">
              <div class="pr-4">
                <h1 class="font-bold text-[2.504rem]">
                  Capgo App
                </h1>
                <p class="text-lg text-gray-300 mt-8">
                  Run your projects on your own device faster than
                  ever, and share those projects across your whole team.
                </p>
                <p class="text-sm text-gray-300 mt-10 mb-20">
                  Test version in the sandbox app, manage version and channel
                </p>
              </div>
              <div class="flex items-center space-x-10">
                <span class="flex items-center bg-[#EAEAEA] px-4 py-1 rounded-[1.125rem]">
                  <svg class="text-pumpkin-orange-500 h-10" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 7H7V13H13V7Z" />
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M7 2C7 1.73478 7.10536 1.48043 7.29289 1.29289C7.48043 1.10536 7.73478 1 8 1C8.26522 1 8.51957 1.10536 8.70711 1.29289C8.89464 1.48043 9 1.73478 9 2V3H11V2C11 1.73478 11.1054 1.48043 11.2929 1.29289C11.4804 1.10536 11.7348 1 12 1C12.2652 1 12.5196 1.10536 12.7071 1.29289C12.8946 1.48043 13 1.73478 13 2V3H15C15.5304 3 16.0391 3.21071 16.4142 3.58579C16.7893 3.96086 17 4.46957 17 5V7H18C18.2652 7 18.5196 7.10536 18.7071 7.29289C18.8946 7.48043 19 7.73478 19 8C19 8.26522 18.8946 8.51957 18.7071 8.70711C18.5196 8.89464 18.2652 9 18 9H17V11H18C18.2652 11 18.5196 11.1054 18.7071 11.2929C18.8946 11.4804 19 11.7348 19 12C19 12.2652 18.8946 12.5196 18.7071 12.7071C18.5196 12.8946 18.2652 13 18 13H17V15C17 15.5304 16.7893 16.0391 16.4142 16.4142C16.0391 16.7893 15.5304 17 15 17H13V18C13 18.2652 12.8946 18.5196 12.7071 18.7071C12.5196 18.8946 12.2652 19 12 19C11.7348 19 11.4804 18.8946 11.2929 18.7071C11.1054 18.5196 11 18.2652 11 18V17H9V18C9 18.2652 8.89464 18.5196 8.70711 18.7071C8.51957 18.8946 8.26522 19 8 19C7.73478 19 7.48043 18.8946 7.29289 18.7071C7.10536 18.5196 7 18.2652 7 18V17H5C4.46957 17 3.96086 16.7893 3.58579 16.4142C3.21071 16.0391 3 15.5304 3 15V13H2C1.73478 13 1.48043 12.8946 1.29289 12.7071C1.10536 12.5196 1 12.2652 1 12C1 11.7348 1.10536 11.4804 1.29289 11.2929C1.48043 11.1054 1.73478 11 2 11H3V9H2C1.73478 9 1.48043 8.89464 1.29289 8.70711C1.10536 8.51957 1 8.26522 1 8C1 7.73478 1.10536 7.48043 1.29289 7.29289C1.48043 7.10536 1.73478 7 2 7H3V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H7V2ZM5 5H15V15H5V5Z" />
                  </svg>
                  <p class="pl-4 text-black">Speed</p>
                </span>
                <span class="flex items-center bg-[#EAEAEA] px-4 py-1 rounded-[1.125rem]">
                  <svg class="text-pumpkin-orange-500 h-10" fill="currentColor" viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M0.166 3.999C3.06114 3.963 5.84481 2.87746 8 0.944C10.155 2.87782 12.9387 3.96373 15.834 4C15.944 4.65 16 5.32 16 6.001C16 11.226 12.66 15.671 8 17.318C3.34 15.67 0 11.225 0 6C0 5.318 0.0569999 4.65 0.166 3.999ZM11.707 7.707C11.8892 7.5184 11.99 7.2658 11.9877 7.0036C11.9854 6.7414 11.8802 6.49059 11.6948 6.30518C11.5094 6.11977 11.2586 6.0146 10.9964 6.01233C10.7342 6.01005 10.4816 6.11084 10.293 6.293L7 9.586L5.707 8.293C5.5184 8.11084 5.2658 8.01005 5.0036 8.01233C4.7414 8.0146 4.49059 8.11977 4.30518 8.30518C4.11977 8.49059 4.0146 8.7414 4.01233 9.0036C4.01005 9.2658 4.11084 9.5184 4.293 9.707L6.293 11.707C6.48053 11.8945 6.73484 11.9998 7 11.9998C7.26516 11.9998 7.51947 11.8945 7.707 11.707L11.707 7.707Z" />
                  </svg>
                  <p class="pl-4 text-black">Security</p>
                </span>
                <span class="flex items-center bg-[#EAEAEA] px-4 py-1 rounded-[1.125rem]">
                  <svg class="text-pumpkin-orange-500 h-10" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Pro 6.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M256 352C293.2 352 319.2 334.5 334.4 318.1C343.3 308.4 358.5 307.7 368.3 316.7C378 325.7 378.6 340.9 369.6 350.6C347.7 374.5 309.7 400 256 400C202.3 400 164.3 374.5 142.4 350.6C133.4 340.9 133.1 325.7 143.7 316.7C153.5 307.7 168.7 308.4 177.6 318.1C192.8 334.5 218.8 352 256 352zM208.4 208C208.4 225.7 194 240 176.4 240C158.7 240 144.4 225.7 144.4 208C144.4 190.3 158.7 176 176.4 176C194 176 208.4 190.3 208.4 208zM304.4 208C304.4 190.3 318.7 176 336.4 176C354 176 368.4 190.3 368.4 208C368.4 225.7 354 240 336.4 240C318.7 240 304.4 225.7 304.4 208zM512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256zM256 48C141.1 48 48 141.1 48 256C48 370.9 141.1 464 256 464C370.9 464 464 370.9 464 256C464 141.1 370.9 48 256 48z" /></svg>
                  <p class="pl-4 text-black">Simplicity</p>
                </span>
              </div>
              <div class="mt-8 mb-16">
                <p class="text-sm text-[#bfbfbf]">
                  Start building rich experiences with your device and your computer.
                </p>
              </div>
              <div class="flex space-x-6">
                <a href="https://play.google.com/store/apps/details?id=ee.forgr.capacitor_go" target="_blank">
                  <img
                    src="/play-store-button.webp" height="4rem;"
                    class="w-auto rounded h-11 sm:h-16 border boder-2 border-white"
                    alt="Apple store download link"
                  >
                </a>
                <a href="https://apps.apple.com/pt/app/capgo/id1602316563" target="_blank">
                  <img
                    src="/app-store-button.webp" height="4rem;"
                    class="w-auto rounded h-11 sm:h-16 border boder-2 border-white"
                    alt="Apple store download link"
                  >
                </a>
              </div>
            </div>
            <div
              class="hidden w-1/2 md:flex space-x-8 justify-end"
            >
              <div class="border-[0.9rem] h-[32rem] w-[18rem] border-[#EAEAEA] bg-cover rounded-[1.5rem]" style="background-image: url(/seeit.png);">
                <span class="flex items-center mx-auto rounded-xl bg-[#d8d8d8] h-3 w-[5rem] mt-2" />
              </div>
              <div class="border-[0.9rem] h-[32rem] w-[18rem] border-[#EAEAEA] bg-cover rounded-[2.5rem]" style="background-image: url(/seeit.png);">
                <span class="flex items-center mx-auto rounded-b-xl bg-[#d8d8d8] h-5 w-[9rem]" />
              </div>
            </div>
          </div>
        </section>
        <Footer />
      </div>
    </IonContent>
  </IonPage>
</template>
