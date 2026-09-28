"use client";
import {HomePage} from "@/components/home/HomePage";
import {usePreferences} from "@/components/shell/PreferencesProvider";
export default function Home(){const {locale}=usePreferences();return <HomePage locale={locale}/>;}
