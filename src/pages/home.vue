
<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
</script>
<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <div class="overflow-x-hidden bg-gray-50">
        <header class="relative py-4 md:py-6">
          <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div class="relative flex items-center justify-between">
              <div class="flex-shrink-0">
                <a href="#" title="" class="flex rounded outline-none focus:ring-1 focus:ring-gray-900 focus:ring-offset-2">
                  <img class="w-auto h-8" src="https://d33wubrfki0l68.cloudfront.net/682a555ec15382f2c6e7457ca1ef48d8dbb179ac/f8cd3/images/logo.svg" alt="">
                </a>
              </div>

              <div class="flex lg:hidden">
                <button type="button" class="text-gray-900">
                  <svg class="w-7 h-7" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>

              <div class="hidden lg:absolute lg:inset-y-0 lg:flex lg:items-center lg:justify-center lg:space-x-12 lg:-translate-x-1/2 lg:left-1/2">
                <a href="#" title="" class="text-base font-medium text-gray-900 transition-all duration-200 rounded focus:outline-none font-pj hover:text-opacity-50 focus:ring-1 focus:ring-gray-900 focus:ring-offset-2"> Experts </a>

                <a href="#" title="" class="text-base font-medium text-gray-900 transition-all duration-200 rounded focus:outline-none font-pj hover:text-opacity-50 focus:ring-1 focus:ring-gray-900 focus:ring-offset-2"> Community Groups </a>

                <a href="#" title="" class="text-base font-medium text-gray-900 transition-all duration-200 rounded focus:outline-none font-pj hover:text-opacity-50 focus:ring-1 focus:ring-gray-900 focus:ring-offset-2"> Support </a>
              </div>

              <div class="hidden lg:flex lg:items-center lg:justify-center lg:space-x-10">
                <a href="#" title="" class="text-base font-medium text-gray-900 transition-all duration-200 rounded focus:outline-none font-pj hover:text-opacity-50 focus:ring-1 focus:ring-gray-900 focus:ring-offset-2"> Login </a>

                <a
                  href="#"
                  title=""
                  class="
                            px-5
                            py-2
                            text-base
                            font-semibold
                            leading-7
                            text-gray-900
                            transition-all
                            duration-200
                            bg-transparent
                            border border-gray-900
                            rounded-xl
                            font-pj
                            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900
                            hover:bg-gray-900 hover:text-white
                            focus:bg-gray-900 focus:text-white
                        "
                  role="button"
                >
                  Join community
                </a>
              </div>
            </div>
          </div>
        </header>

        <section class="relative py-12 sm:py-16 lg:pt-20 xl:pb-0">
          <div class="relative px-4 mx-auto sm:px-6 lg:px-8 max-w-7xl">
            <div class="max-w-3xl mx-auto text-center">
              <p class="inline-flex px-4 py-2 text-base text-gray-900 border border-gray-200 rounded-full font-pj">
                Made by Developers, for Developers
              </p>
              <h1 class="mt-5 text-4xl font-bold leading-tight text-gray-900 sm:text-5xl sm:leading-tight lg:text-6xl lg:leading-tight font-pj">
                Quality resources shared by the community
              </h1>
              <p class="max-w-md mx-auto mt-6 text-base leading-7 text-gray-600 font-inter">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vehicula massa in enim luctus. Rutrum arcu.
              </p>

              <div class="relative inline-flex mt-10 group">
                <div class="absolute transitiona-all duration-1000 opacity-70 -inset-px bg-gradient-to-r from-[#44BCFF] via-[#FF44EC] to-[#FF675E] rounded-xl blur-lg group-hover:opacity-100 group-hover:-inset-1 group-hover:duration-200 animate-tilt" />

                <a href="#" title="" class="relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-gray-900 font-pj rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900" role="button">
                  Get access to 4,958 resources
                </a>
              </div>
            </div>
          </div>

          <div class="mt-16 md:mt-20">
            <img class="object-cover object-top w-full h-auto mx-auto scale-150 2xl:max-w-screen-2xl xl:scale-100" src="https://d33wubrfki0l68.cloudfront.net/54780decfb9574945bc873b582cdc6156144a2ba/d9fa1/images/hero/4/illustration.png" alt="">
          </div>
        </section>
      </div>
    </IonContent>
  </IonPage>
</template>
