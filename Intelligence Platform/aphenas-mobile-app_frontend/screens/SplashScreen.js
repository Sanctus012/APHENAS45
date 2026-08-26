import React, { useEffect, useRef } from 'react';

import {
  View,
  Text,
  Image,
  Animated,
  StyleSheet,
} from 'react-native';


export default function SplashScreen({ onFinish }) {

  const progress = useRef(new Animated.Value(0)).current;


  useEffect(() => {

    // Animate the loading bar from 0% to 100%
    Animated.timing(progress, {
      toValue: 1,
      duration: 5000,
      useNativeDriver: false,
    }).start();


    // Go to Login after exactly 5 seconds
    const timer = setTimeout(() => {

      onFinish();

    }, 5000);


    return () => clearTimeout(timer);

  }, [onFinish]);


  const progressWidth = progress.interpolate({

    inputRange: [0, 1],

    outputRange: ['0%', '100%'],

  });


  return (

    <View style={styles.container}>

      {/* APHENAS LOGO */}

      <Image
        source={require('../assets/aphenas-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />


      {/* LOADING TEXT */}

      <Text style={styles.loadingText}>
        LOADING
      </Text>


      {/* LOADING BAR */}

      <View style={styles.progressBackground}>

        <Animated.View
          style={[
            styles.progressBar,
            {
              width: progressWidth,
            },
          ]}
        />

      </View>

    </View>

  );

}


const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#050505',
    justifyContent: 'center',
    alignItems: 'center',
  },


  logo: {
    width: 220,
    height: 220,
    marginBottom: 25,
  },


  loadingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
    marginBottom: 12,
  },


  progressBackground: {
    width: 220,
    height: 4,
    backgroundColor: '#333333',
    borderRadius: 2,
    overflow: 'hidden',
  },


  progressBar: {
    height: 4,
    backgroundColor: '#00FF66',
    borderRadius: 2,
  },

});